package com.maxine.client.spring;

import com.maxine.client.MaxineClient;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
@ConditionalOnClass(MaxineClient.class)
@EnableConfigurationProperties(MaxineClientProperties.class)
@ConditionalOnProperty(prefix = "maxine.client", name = "enabled", havingValue = "true", matchIfMissing = true)
public class MaxineSpringBootAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(prefix = "maxine.client", name = "base-url")
    public MaxineClient maxineClient(MaxineClientProperties properties) {
        return new MaxineClient(properties.getBaseUrl());
    }

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(prefix = "maxine.client", name = "base-url")
    public MaxineHeartbeatLifecycle maxineHeartbeatLifecycle(MaxineClientProperties properties,
                                                             MaxineClient maxineClient,
                                                             Environment environment,
                                                             ApplicationContext applicationContext) {
        return new MaxineHeartbeatLifecycle(properties, maxineClient, environment, applicationContext);
    }
}
