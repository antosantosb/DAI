package dai.tub.pgu.audit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// Diz ao Java que esta "etiqueta" é para colar em cima de métodos
@Target(ElementType.METHOD)
// Diz que a "etiqueta" deve estar ativa enquanto a aplicação corre
@Retention(RetentionPolicy.RUNTIME)
public @interface LogActivity 
{
    // Permite-nos escrever uma mensagem personalizada.
    String action() default "Ação genérica"; 
}