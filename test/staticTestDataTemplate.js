const staticTestData = [
    {
        description : "API /actuator/health",
        tests: [
            {
                description : "Actuator-Health should return 200",
                url : "/actuator/health",
                expectedStatus : 200,
                responseBodyType : 'object',
                expectedBody : {"status": "UP"}
            },
            {
                description : "Actuator-Info should return 200",
                url : "/actuator/info",
                expectedStatus : 200,
                responseBodyType: 'object',
                expectedBody : {
                    "build": {
                        "name" : "maxine-discovery",
                        "description" : "Maxine is a discovery and a registry server for all the running nodes with gargantua client dependency.","version":"1.0.0"
                    }
                }
            },
        ]
    }
];

module.exports = staticTestData;