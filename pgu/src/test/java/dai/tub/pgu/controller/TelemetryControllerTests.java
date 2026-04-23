package dai.tub.pgu.controller;

import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.service.TelemetryService;

import org.checkerframework.checker.units.qual.A;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Collections;
import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TelemetryController.class)
@AutoConfigureMockMvc(addFilters = false) // Desativa filtros de segurança para testes
class TelemetryControllerTests {
    @Autowired
    private MockMvc mockMvc;
    @MockBean
    private TelemetryService telemetryService;

    @Test
    @DisplayName("Deve devolver 200 OK e uma lista quando existir telemetria")
    void testGetTelemetry() throws Exception {
        TelemetryDTO telemetryDTO = new TelemetryDTO();
        telemetryDTO.setBusId("Autocarro teste");
        telemetryDTO.setLatitude(41.545448);
        telemetryDTO.setLongitude(-8.426507);
        telemetryDTO.setSpeed(60.0);
        telemetryDTO.setStatus("Em movimento");
        telemetryDTO.setPassengers(30);
        telemetryDTO.setNextStop("Paragem teste");
        telemetryDTO.setStopsRemaining(5);

        List<TelemetryDTO> telemetryList = Collections.singletonList(telemetryDTO);
        when(telemetryService.getAllTelemetry()).thenReturn(telemetryList);

        mockMvc.perform(get("/api/telemetry"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].busId").value("Autocarro teste"))
                .andExpect(jsonPath("$[0].latitude").value(41.545448))
                .andExpect(jsonPath("$[0].longitude").value(-8.426507))
                .andExpect(jsonPath("$[0].speed").value(60.0))
                .andExpect(jsonPath("$[0].status").value("Em movimento"))
                .andExpect(jsonPath("$[0].passengers").value(30))
                .andExpect(jsonPath("$[0].nextStop").value("Paragem teste"))
                .andExpect(jsonPath("$[0].stopsRemaining").value(5));
    }

    @Test
    @DisplayName("Deve devolver 204 No Content quando não existir telemetria")
    void testGetTelemetryNotFound() throws Exception {
        when(telemetryService.getAllTelemetry()).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/api/telemetry"))
                .andExpect(status().isNoContent());
    }
}
