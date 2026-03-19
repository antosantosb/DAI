package dai.tub.pgu.config;

import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.integration.channel.DirectChannel;
import org.springframework.integration.core.MessageProducer;
import org.springframework.integration.mqtt.core.DefaultMqttPahoClientFactory;
import org.springframework.integration.mqtt.core.MqttPahoClientFactory;
import org.springframework.integration.mqtt.inbound.MqttPahoMessageDrivenChannelAdapter;
import org.springframework.integration.mqtt.support.DefaultPahoMessageConverter;
import org.springframework.messaging.MessageChannel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.mapper.TelemetryMapper;
import dai.tub.pgu.service.TelemetryService;

@Configuration
public class MqttConfig 
{
    // Vai buscar as variáveis do file application.properties
    @Value("${mqtt.broker.url}")
    private String brokerUrl;

    @Value("${mqtt.client.id}")
    private String clientId;

    @Value("${mqtt.topics.telemetry}")
    private String telemetryTopic;

    // Configuração da ligação ao Mosquitto
    @Bean
    public MqttPahoClientFactory mqttClientFactory()
    {
        DefaultMqttPahoClientFactory factory = new DefaultMqttPahoClientFactory();
        
        MqttConnectOptions options = new MqttConnectOptions();
        
        // Configuração das options
        options.setServerURIs(new String[] {brokerUrl}); // Dá set no URI com o brokerUrl
        options.setCleanSession(true);

        // Utiliza as options criadas, na factory
        factory.setConnectionOptions(options); 

        return factory;
    }

    // Criação do canal de entrada
    @Bean
    public MessageChannel mqttInputChannel()
    {
        return new DirectChannel();
    } 

    // Criação da escuta "Listener"
    @Bean
    public MessageProducer inBound()
    {
        MqttPahoMessageDrivenChannelAdapter adapter = new MqttPahoMessageDrivenChannelAdapter(clientId, mqttClientFactory(), telemetryTopic);
        
        adapter.setCompletionTimeout(5000);
        adapter.setConverter(new DefaultPahoMessageConverter());
        adapter.setQos(1); // Qualidade de serviço 1 (Garante a entrega)
        adapter.setOutputChannel(mqttInputChannel());

        return adapter;
    }

    // O que fazer ao receber uma mensagem do Mosquitto
    @Bean
    @ServiceActivator(inputChannel = "mqttInputChannel")
    public org.springframework.messaging.MessageHandler handler(TelemetryService telemetryService, SimpMessagingTemplate messagingTemplate)
    {
        return new org.springframework.messaging.MessageHandler()
        {
            @Override
            public void handleMessage(Message<?> message)
            {
                try
                {
                    String payload = message.getPayload().toString();

                    TelemetryDTO telemetry = TelemetryMapper.fromJson(payload);

                    telemetryService.processAndSaveTelemetry(telemetry);

                    //ponte entre o mosquito e o websocket
                    messagingTemplate.convertAndSend("/topic/telemetry", telemetry);

                    System.out.println("Telemetria Guardada!");
                }
                catch (Exception e)
                {
                    System.err.println("Erro ao converter JSON do MQTT: " + e.getMessage());
                    e.printStackTrace();
                }
            }
        };
    }
}
