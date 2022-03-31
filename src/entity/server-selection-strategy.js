class ServerSelectionStrategy{
    static ROUND_ROBIN = 0;
    static CONSISTENT_HASHING  = 1;

    static currentStrategy = ServerSelectionStrategy.CONSISTENT_HASHING;

    static isRoundRobin() {
        return this.currentStrategy === this.ROUND_ROBIN;
    }

    static isConsistentHashing() {
        return this.currentStrategy === this.CONSISTENT_HASHING;
    }
}

module.exports = {
    ServerSelectionStrategy
}