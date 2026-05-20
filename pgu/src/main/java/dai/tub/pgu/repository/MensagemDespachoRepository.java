package dai.tub.pgu.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

import dai.tub.pgu.domain.MensagemDespacho;
import dai.tub.pgu.domain.EstadoMensagem;

@Repository
public interface MensagemDespachoRepository extends JpaRepository<MensagemDespacho, Long> {
    List<MensagemDespacho> findByBusIdOrderByTimestampEnvioDesc(String busId);
    List<MensagemDespacho> findByEstadoOrderByTimestampEnvioDesc(EstadoMensagem estado);
    Optional<MensagemDespacho> findByMqttMessageId(String mqttMessageId);
}
