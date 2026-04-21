import jakarta.persistence.*;
import java.time.LocalDateTime;


@Entity
@Table(name = "historico_alertas")
public class HistoricoAlerta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDateTime data;
    private String autocarro;
    private String motivo;

    // Construtores, Getters e Setters
    public HistoricoAlerta() {}

    public HistoricoAlerta(String autocarro, String motivo) {
        this.data = LocalDateTime.now();
        this.autocarro = autocarro;
        this.motivo = motivo;
    }
    
    public Long getId() {
        return id;
    }

    public LocalDateTime getData() {
        return data;
    }
    public String getAutocarro() {
        return autocarro;
    }
    public String getMotivo() {
        return motivo;
    }
    public void setId(Long id) {
        this.id = id;
    }
    public void setData(LocalDateTime data) {
        this.data = data;
    }
    public void setAutocarro(String autocarro) {
        this.autocarro = autocarro;
    }
    public void setMotivo(String motivo) {
        this.motivo = motivo;
    }
}