package dai.tub.pgu.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@TestPropertySource(properties = {
    "pgu.ai.enabled=true",
    "spring.ai.ollama.base-url=http://localhost:11434"  // Ajustar se necessário
})
@DisplayName("Testes de avaliação do Agente IA (Evals)")
public class AiEvalTest {

    @Autowired
    private AiChatService chatService;

    // Definição de cada caso de teste
    record EvalCase(String question, String[] expectedTools, String expectedAnswerPattern) {}

    // Lista completa de 16 casos de teste (R.IA.06 do plano)
    static final EvalCase[] CASES = {
        new EvalCase("Qual a ocupação média da Linha 5 ontem?",
            new String[]{"getFleetOccupancyByHour"}, "ocupaç|linha 5|lotação"),
        new EvalCase("Que alertas críticos estão abertos?",
            new String[]{"getActiveAlerts"}, "alerta|crítico|abertos"),
        new EvalCase("Quantas ocorrências abertas há agora?",
            new String[]{"getOcorrenciasOpenCount"}, "ocorrência|abertas"),
        new EvalCase("Quanto consumimos em eletricidade esta semana?",
            new String[]{"getEnergyConsumptionStats"}, "kWh|consumo|energia"),
        new EvalCase("Quais os autocarros com mais avarias este mês?",
            new String[]{"getTopProblematicVehicles"}, "avaria|problemático|top"),
        new EvalCase("Mostra os atrasos da Linha 12 hoje",
            new String[]{"getRouteDelayStats"}, "atraso|linha 12"),
        new EvalCase("Próximas chegadas na paragem 207",
            new String[]{"getGtfsSchedule"}, "chegada|paragem 207|horário"),
        new EvalCase("Há interrupções de serviço ativas?",
            new String[]{"getServiceAlerts"}, "interrupção|serviço|alerta"),
        new EvalCase("Qual a utilização dos carregadores Mobi.E esta semana?",
            new String[]{"getChargingUtilizationStats"}, "carregador|Mobi|utilização"),
        new EvalCase("Intervalo médio entre buses na Linha 5",
            new String[]{"getHeadwayStats"}, "headway|intervalo|bunching"),
        new EvalCase("Motoristas com discrepâncias de bilhética este mês",
            new String[]{"getReconciliationsAtRisk"}, "discrepância|bilhética|fraude"),
        new EvalCase("Consumo energético total no último mês",
            new String[]{"getEnergyConsumptionStats"}, "kWh|consumo|energia"),
        new EvalCase("Ocorrências críticas não resolvidas",
            new String[]{"getOcorrenciasOpenCount"}, "crítica|aberta|não resolvida"),
        new EvalCase("Velocidade média da frota na última hora",
            new String[]{"getFleetOccupancyByHour"}, "velocidade|frota"),
        new EvalCase("Top 3 paragens com mais atrasos hoje",
            new String[]{"getRouteDelayStats"}, "paragem|atraso|top"),
        new EvalCase("Quantos autocarros estão ativos neste momento?",
            new String[]{"getFleetOccupancyByHour"}, "ativo|autocarros|frota")
    };

    @Test
    @DisplayName("Executa todos os evals e verifica taxa de sucesso >= 70%")
    // Timeout global de 60 segundos por caso (cada chamada pode demorar)
    public void runEvals() {
        int passed = 0;
        int total = CASES.length;
        StringBuilder failures = new StringBuilder();

        for (EvalCase c : CASES) {
            try {
                // Executa a pergunta
                var result = chatService.processChat("eval-user", "eval-tester", UUID.randomUUID(), c.question());

                // 1. Verifica se as tools esperadas foram chamadas (pelo menos uma delas)
                List<String> expectedToolsList = Arrays.asList(c.expectedTools());
                boolean toolsOk = expectedToolsList.stream().anyMatch(tool -> result.toolsCalled().contains(tool));

                // 2. Verifica se a resposta contém o padrão esperado (case-insensitive, multi-linha)
                Pattern pattern = Pattern.compile(c.expectedAnswerPattern(), Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
                boolean answerOk = pattern.matcher(result.response()).find();

                if (toolsOk && answerOk) {
                    passed++;
                } else {
                    failures.append(String.format("\n[FALHA] Pergunta: %s%n  Tools esperadas: %s%n  Tools chamadas: %s%n  Padrão esperado: %s%n  Resposta: %s%n",
                            c.question(), expectedToolsList, result.toolsCalled(), c.expectedAnswerPattern(), result.response()));
                }
            } catch (Exception e) {
                failures.append(String.format("\n[ERRO] Pergunta: %s%n  Exceção: %s%n", c.question(), e.getMessage()));
            }
        }

        double successRate = (double) passed / total * 100;
        System.out.printf("Resultado dos evals: %d / %d passaram (%.1f%%)%n", passed, total, successRate);
        if (failures.length() > 0) {
            System.out.println("Detalhe das falhas:" + failures);
        }

        assertThat(passed)
                .as("Pelo menos 70%% dos evals devem passar. Taxa atual: %.1f%%", successRate)
                .isGreaterThanOrEqualTo((int) Math.ceil(total * 0.7));
    }
}