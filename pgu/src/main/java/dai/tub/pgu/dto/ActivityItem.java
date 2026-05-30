package dai.tub.pgu.dto;

/**
 * Sprint 2 (estilo BRT): item normalizado do "activity feed" unificado.
 *
 * <p>Cada evento recente do sistema, vindo de varias fontes (historico_alertas,
 * ocorrencias, audit_log), e' projetado para esta forma comum para alimentar
 * um feed de atividade read-only. Construido em {@link dai.tub.pgu.service.ActivityService}.
 *
 * <ul>
 *   <li>{@code timestamp}   : data/hora local "YYYY-MM-DD HH:MM" (fuso Europe/Lisbon).</li>
 *   <li>{@code category}    : "ALERTA" | "OCORRENCIA" | "AUDIT".</li>
 *   <li>{@code title}       : resumo curto do evento (motivo / tipo de anomalia / acao).</li>
 *   <li>{@code description} : detalhe opcional (pode ser nulo).</li>
 *   <li>{@code actor}       : autor do evento quando aplicavel, ex.: utilizador do audit (pode ser nulo).</li>
 * </ul>
 */
public record ActivityItem(
        String timestamp,
        String category,
        String title,
        String description,
        String actor
) {
}
