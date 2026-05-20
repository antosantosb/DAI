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

    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;
    private MqttClient mqttClient;

    public MqttDespachoService(ApplicationEventPublisher eventPublisher, ObjectMapper objectMapper) {
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
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
            }
        } catch (MqttException e) {
            log.error("Erro ao subscrever tópico de ACKs {}: {}", topicoAckWildcard, e.getMessage());
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

            // Tópico esperado: tub/dispatch/{busId}/ack
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
