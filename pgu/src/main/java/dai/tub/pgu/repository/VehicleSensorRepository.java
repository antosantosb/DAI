package dai.tub.pgu.repository;

import dai.tub.pgu.domain.VehicleSensor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repositorio do inventario de main sensors (gateways de telematica a bordo).
 *
 * <p>Suporta a listagem de sensores livres (sem autocarro, {@code bus_id IS NULL})
 * e por autocarro, para os fluxos de atribuir/libertar.
 */
@Repository
public interface VehicleSensorRepository extends JpaRepository<VehicleSensor, Long> {

    // Sensores atribuidos a um autocarro (no novo modelo tipicamente 0 ou 1).
    List<VehicleSensor> findByBusId(Long busId);

    // Fase C (Passo 1): resolucao do main sensor pelo codigo do gateway, usada na
    // ingestao de telemetria keyed por sensor (frame -> sensor -> bus_id -> autocarro).
    Optional<VehicleSensor> findByGateway(String gateway);

    // Sensores livres (sem autocarro atribuido).
    List<VehicleSensor> findByBusIdIsNull();

    // Sensores por estado (ATIVO, INATIVO, AVARIA, DESCONHECIDO).
    List<VehicleSensor> findByStatus(String status);

    // Ha' ja' um main sensor atribuido a este autocarro? (validacao de atribuicao).
    boolean existsByBusId(Long busId);
}
