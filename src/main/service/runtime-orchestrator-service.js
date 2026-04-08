const { clusterLeaderService } = require('./cluster-leader-service');
const { upstreamHealthService } = require('./upstream-health-service');

class RuntimeOrchestratorService {
    started = false;

    start = async () => {
        if (this.started) {
            return;
        }

        this.started = true;
        await clusterLeaderService.start();
        await upstreamHealthService.start();
    }

    stop = async () => {
        await upstreamHealthService.stop();
        await clusterLeaderService.stop();
        this.started = false;
    }
}

const runtimeOrchestratorService = new RuntimeOrchestratorService();

module.exports = {
    runtimeOrchestratorService
};
