package dai.tub.pgu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Service
public class MqttDespachoService {

    private static final Logger log = LoggerFactory.getLogger(MqttDespachoService.class);

    @Value("${pgu.despacho.mqtt.broker-url:tcp://mosquitto:1883}")
    private String brokerUrl;

    @Value("${pgu.despacho.mqtt.topico-envio:tub/dispatch}")
    private String topicoEnvioBase;

    @Value("${pgu.despacho.mqtt.topico-ack:tub/dispatch/+/ack}")
    private String topicoAckWildcard;

    // Sprint -1 (SEC-1): credenciais Mosquitto (anonimos rejeitados).
    @Value("${pgu.despacho.mqtt.username:backend}")
    private String mqttUsername;

    @Value("${pgu.despacho.mqtt.password}")
    private String mqttPassword;

    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;
    // Sprint 5 (follow-up): heartbeats dos paineis vem por MQTT (sem NiFi).
    private final org.springframework.context.ApplicationContext applicationContext;
    private MqttClient mqttClient;

    public MqttDespachoService(ApplicationEventPublisher eventPublisher,
                                ObjectMapper objectMapper,
                                org.springframework.context.ApplicationContext applicationContext) {
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
        this.applicationContext = applicationContext;
    }

    @PostConstruct
    public void init() {
        conectarBroker();
    }

    private synchronized void conectarBroker() {
        try {
            String clientId = "pgu-backend-dispatch-" + MqttClient.generateClientId();
            mqttClient = new MqttClient(brokerUrl, clientId, new MemoryPersistence());

            MqttConnectOptions options = new MqttConnectOptions();
            options.setCleanSession(true);
            options.setAutomaticReconnect(true);
            options.setConnectionTimeout(10);
            options.setKeepAliveInterval(60);
            // Sprint -1 (SEC-1): autenticacao Mosquitto.
            options.setUserName(mqttUsername);
            if (mqttPassword != null) options.setPassword(mqttPassword.toCharArray());

            mqttClient.setCallback(new MqttCallbackExtended() {
                @Override
                public void connectComplete(boolean reconnect, String serverURI) {
                    log.info("Ligado ao broker MQTT: {} (Reconnect: {})", serverURI, reconnect);
                    subscreverAcks();
                }

                @Override
                public void connectionLost(Throwable cause) {
                    log.warn("Ligação perdida com o broker MQTT: {}", cause != null ? cause.getMessage() : "Desconhecido");
                }

                @Override
                public void messageArrived(String topic, MqttMessage message) {
                    processarMensagemRecebida(topic, message);
                }

                @Override
                public void deliveryComplete(IMqttDeliveryToken token) {
                    // Sem ação necessária
                }
            });

            mqttClient.connect(options);

        } catch (MqttException e) {
            log.error("Falha ao ligar ao broker MQTT em {}: {}. O re-connecting automático tentará recuperar.", brokerUrl, e.getMessage());
        }
    }

    private void subscreverAcks() {
        try {
            if (mqttClient != null && mqttClient.isConnected()) {
                mqttClient.subscribe(topicoAckWildcard, 1);
                log.info("Subscrição efetuada no tópico de ACKs: {}", topicoAckWildcard);
                // Sprint 5 (follow-up): heartbeats dos paineis DMS chegam por
                // MQTT (sem NiFi). Apanhamos directo aqui para o backend
                // chamar DisplayPanelService.recordHeartbeat.
                mqttClient.subscribe("tub/panels/heartbeat", 0);
                log.info("Subscrição efetuada no tópico de heartbeats dos paineis: tub/panels/heartbeat");
            }
        } catch (MqttException e) {
            log.error("Erro ao subscrever tópicos MQTT: {}", e.getMessage());
        }
    }

    /**
     * Sprint 5 (follow-up): publicar payload generico num tópico arbitrário,
     * reutilizando a conexão MQTT do despacho. Usado pelo PanelContentScheduler
     * para empurrar próximas chegadas a cada painel DMS físico.
     */
    public boolean publishToTopic(String topic, Object payload) {
        try {
            if (mqttClient == null || !mqttClient.isConnected()) {
                log.warn("MQTT publish skip: cliente nao ligado (topic={})", topic);
                return false;
            }
            byte[] jsonBytes = objectMapper.writeValueAsBytes(payload);
            MqttMessage msg = new MqttMessage(jsonBytes);
            msg.setQos(0); // fire-and-forget; o painel re-le no proximo ciclo
            mqttClient.publish(topic, msg);
            return true;
        } catch (Exception e) {
            log.warn("MQTT publish falhou (topic={}): {}", topic, e.getMessage());
            return false;
        }
    }

    public void publicarMensagem(String busId, String messageId, String content, String operador) {
        try {
            if (mqttClient == null || !mqttClient.isConnected()) {
                log.error("Impossível publicar mensagem: cliente MQTT não está ligado!");
                throw new IllegalStateException("Cliente MQTT não ligado ao broker.");
            }

            String topico = topicoEnvioBase + "/" + busId;

            Map<String, Object> payload = new HashMap<>();
            payload.put("messageId", messageId);
            payload.put("content", content);
            payload.put("timestamp", Instant.now().toString());
            payload.put("operador", operador);
            payload.put("priority", "NORMAL");

            byte[] jsonBytes = objectMapper.writeValueAsBytes(payload);
            MqttMessage msg = new MqttMessage(jsonBytes);
            msg.setQos(1);

            mqttClient.publish(topico, msg);
            log.info("Mensagem de despacho publicada no tópico {}: ID {}", topico, messageId);

        } catch (Exception e) {
            log.error("Erro ao publicar mensagem no broker: {}", e.getMessage());
            throw new RuntimeException("Erro ao enviar mensagem via MQTT: " + e.getMessage(), e);
        }
    }

    private void processarMensagemRecebida(String topic, MqttMessage message) {
        try {
            String payload = new String(message.getPayload());
            log.debug("Mensagem MQTT recebida no tópico {}: {}", topic, payload);

            // Sprint 5 (follow-up): heartbeats dos paineis (tub/panels/heartbeat)
            // sao processados aqui directamente (bypass NiFi).
            if ("tub/panels/heartbeat".equals(topic)) {
                processarHeartbeatPainel(payload);
                return;
            }

            // Tópico esperado para ACKs: tub/dispatch/{busId}/ack
            String[] parts = topic.split("/");
            if (parts.length < 3) {
                log.warn("Tópico inválido ignorado: {}", topic);
                return;
            }

            String busId = parts[2];

            Map<?, ?> map = objectMapper.readValue(payload, Map.class);
            String messageId = (String) map.get("messageId");
            String type = (String) map.get("type");

            if (messageId != null && type != null) {
                log.info("ACK recebido da viatura {} para mensagem {}: {}", busId, messageId, type);
                eventPublisher.publishEvent(new MqttAckEvent(this, busId, messageId, type));
            } else {
                log.warn("Mensagem ACK inválida recebida: {}", payload);
            }

        } catch (Exception e) {
            log.error("Erro ao processar mensagem MQTT recebida: {}", e.getMessage());
        }
    }

    /**
     * Sprint 5 (follow-up): payload do heartbeat dos paineis enviado pelo
     * simulador. Aceita {@code panelCode, batteryPct?, temperatureC?, firmware?, status?}.
     * Chama directamente {@code DisplayPanelService.recordHeartbeat} (lookup
     * via ApplicationContext para evitar ciclo de dependencia).
     */
    private void processarHeartbeatPainel(String payload) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = objectMapper.readValue(payload, Map.class);
            String code = (String) map.getOrDefault("panelCode", map.get("code"));
            if (code == null || code.isBlank()) {
                log.warn("Heartbeat de painel sem panelCode: {}", payload);
                return;
            }
            Short battery = null;
            if (map.get("batteryPct") != null) {
                try { battery = Short.valueOf(map.get("batteryPct").toString()); } catch (Exception ignore) {}
            }
            java.math.BigDecimal temp = null;
            if (map.get("temperatureC") != null) {
                try { temp = new java.math.BigDecimal(map.get("temperatureC").toString()); } catch (Exception ignore) {}
            }
            String firmware = (String) map.get("firmware");
            String status = (String) map.get("status");
            DisplayPanelService svc = applicationContext.getBean(DisplayPanelService.class);
            svc.recordHeartbeat(code, battery, temp, firmware, status);
        } catch (Exception e) {
            log.warn("Falha a processar heartbeat de painel: {}", e.getMessage());
        }
    }

    @PreDestroy
    public void cleanup() {
        try {
            if (mqttClient != null && mqttClient.isConnected()) {
                mqttClient.disconnect();
                mqttClient.close();
                log.info("Cliente MQTT desligado e limpo com sucesso.");
            }
        } catch (MqttException e) {
            log.error("Erro ao encerrar cliente MQTT: {}", e.getMessage());
        }
    }
}
