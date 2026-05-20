package dai.tub.pgu.dto;

import lombok.Getter;
import lombok.Setter;
import java.time.Instant;

@Getter
@Setter
public class MensagemDespachoDTO {
    private Long id;
    private String busId;
    private String conteudo;
    private String estado;
    private String operador;
    private Instant timestampEnvio;
    private Instant timestampEntrega;
    private Instant timestampLeitura;
    private String erroDetalhe;
    private String mqttMessageId;
}
