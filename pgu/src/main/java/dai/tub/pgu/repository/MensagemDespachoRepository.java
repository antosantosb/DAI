package dai.tub.pgu.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    /**
     * Conta mensagens vindas do motorista (operador começa com 'motorista:')
     * que ainda não foram lidas pelo operador, para um autocarro específico.
     */
    @Query("SELECT COUNT(m) FROM MensagemDespacho m " +
           "WHERE m.busId = :busId AND m.lidaPeloOperador = false AND m.operador LIKE 'motorista:%'")
    long countUnreadByBusId(@Param("busId") String busId);

    /**
     * Devolve [busId, count] para todos os autocarros com mensagens não lidas.
     * Permite ao backoffice obter os badges de todos os autocarros numa única chamada.
     */
    @Query("SELECT m.busId, COUNT(m) FROM MensagemDespacho m " +
           "WHERE m.lidaPeloOperador = false AND m.operador LIKE 'motorista:%' " +
           "GROUP BY m.busId")
    List<Object[]> countUnreadGroupedByBus();

    /**
     * Marca como lidas todas as mensagens do motorista para um autocarro.
     */
    @Modifying
    @Query("UPDATE MensagemDespacho m SET m.lidaPeloOperador = true " +
           "WHERE m.busId = :busId AND m.lidaPeloOperador = false AND m.operador LIKE 'motorista:%'")
    int markAllAsReadByOperator(@Param("busId") String busId);
}
