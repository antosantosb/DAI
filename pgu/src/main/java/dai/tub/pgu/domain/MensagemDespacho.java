package dai.tub.pgu.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.Instant;

@Entity
@Table(name = "mensagens_despacho")
@Getter
@Setter
public class MensagemDespacho {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bus_id", nullable = false, length = 50)
    private String busId;

    @Column(nullable = false, length = 140)
    private String conteudo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private EstadoMensagem estado = EstadoMensagem.ENVIADA;

    @Column(nullable = false, length = 100)
    private String operador;

    @Column(name = "timestamp_envio", nullable = false)
    private Instant timestampEnvio = Instant.now();

    @Column(name = "timestamp_entrega")
    private Instant timestampEntrega;

    @Column(name = "timestamp_leitura")
    private Instant timestampLeitura;

    @Column(name = "erro_detalhe", columnDefinition = "TEXT")
    private String erroDetalhe;

    @Column(name = "mqtt_message_id", length = 100)
    private String mqttMessageId;
}
