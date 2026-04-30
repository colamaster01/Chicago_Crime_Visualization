export const State = {
    filters: {
        year: [2020, 2026],
        month: [1, 12],  
        time: [0, 24], 
        crimeTypes: ['THEFT', 'BATTERY', 'CRIMINAL DAMAGE', 'NARCOTICS', 'ASSAULT', 'BURGLARY', 'ROBBERY', 'MOTOR VEHICLE THEFT', 'HOMICIDE', 'OTHER'],
        crimeWeights: {} 
    },
    
    mapBounds: null, 
    listeners: [],

    initWeights() {
        const types = this.filters.crimeTypes;
        if (types.length === 0) {
            this.filters.crimeWeights = {};
            return;
        }
        const w = 1.0 / types.length;
        this.filters.crimeWeights = {};
        types.forEach(t => this.filters.crimeWeights[t] = w);
    },

    // 👇 新增：专门供 UI Reset 按钮调用的重置与通知方法
    resetWeights() {
        this.initWeights();
        this.notify('filter'); // 广播触发全图渲染
    },

    updateFilter(key, valueArray) {
        this.filters[key] = valueArray;
        this.notify('filter'); 
    },

    updateCrimeTypes(typesArray) {
        this.filters.crimeTypes = typesArray;
        this.initWeights();
        this.notify('filter'); 
    },

    updateSingleWeight(type, delta) {
        let currentW = this.filters.crimeWeights[type];
        if (currentW === undefined) return;

        let newW = Math.max(0.01, Math.min(0.99, currentW + delta)); 
        let actualDelta = newW - currentW; 

        let othersSum = 1.0 - currentW;
        if (othersSum <= 0.001) return; 

        this.filters.crimeWeights[type] = newW;
        let remainingCheckSum = 0;
        const otherKeys = Object.keys(this.filters.crimeWeights).filter(k => k !== type);

        otherKeys.forEach((k, i) => {
            if (i === otherKeys.length - 1) {
                this.filters.crimeWeights[k] = Math.max(0.001, 1.0 - newW - remainingCheckSum);
            } else {
                let w = this.filters.crimeWeights[k];
                let distributed = w - actualDelta * (w / othersSum);
                this.filters.crimeWeights[k] = Math.max(0.001, distributed);
                remainingCheckSum += this.filters.crimeWeights[k];
            }
        });
        
        this.notify('filter'); 
    },

    updateBounds(bounds) {
        this.mapBounds = bounds;
        this.notify('bounds'); 
    },

    subscribe(callback) {
        this.listeners.push(callback);
    },

    notify(source = 'init') {
        this.listeners.forEach(callback => callback(this.filters, this.mapBounds, source));
    }
};

State.initWeights();