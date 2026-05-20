package dai.tub.pgu.service;

import org.springframework.context.ApplicationEvent;

public class MqttAckEvent extends ApplicationEvent {
    private final String busId;
    private final String messageId;
    private final String type;

    public MqttAckEvent(Object source, String busId, String messageId, String type) {
        super(source);
        this.busId = busId;
        this.messageId = messageId;
        this.type = type;
    }

    public String getBusId() { return busId; }
    public String getMessageId() { return messageId; }
    public String getType() { return type; }
}
