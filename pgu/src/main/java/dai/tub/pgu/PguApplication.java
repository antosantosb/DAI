package dai.tub.pgu;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class PguApplication 
{
	public static void main(String[] args) 
	{
		SpringApplication.run(PguApplication.class, args);
	}
}
