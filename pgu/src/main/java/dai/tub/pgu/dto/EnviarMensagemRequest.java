package dai.tub.pgu.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class EnviarMensagemRequest {
    @NotBlank(message = "Mensagem inválida: o conteúdo não pode estar vazio")
    @Size(min = 1, max = 140, message = "Mensagem inválida: o conteúdo não pode estar vazio e deve ter no máximo 140 caracteres")
    private String conteudo;
}
