export const State = {
    filters: {
        year: [2020, 2027],  
        month: [1, 13],      
        time: [0, 24], 
        crimeTypes: ['THEFT', 'BATTERY', 'CRIMINAL DAMAGE', 'NARCOTICS', 'ASSAULT', 'BURGLARY', 'ROBBERY', 'MOTOR VEHICLE THEFT', 'HOMICIDE', 'OTHER'],
        crimeWeights: {} 
    },
    
    explicitTypes: ['THEFT', 'BATTERY', 'CRIMINAL DAMAGE', 'NARCOTICS', 'ASSAULT', 'BURGLARY', 'ROBBERY', 'MOTOR VEHICLE THEFT', 'HOMICIDE'],
    
    typeColors: {
        'THEFT': '#1f77b4', 'BATTERY': '#ff7f0e', 'CRIMINAL DAMAGE': '#ffbb78',
        'NARCOTICS': '#2ca02c', 'ASSAULT': '#d62728', 'BURGLARY': '#9467bd',
        'ROBBERY': '#8c564b', 'MOTOR VEHICLE THEFT': '#e377c2', 'HOMICIDE': '#00ffff', 
        'OTHER': '#7f7f7f' 
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

    resetWeights() {
        this.initWeights();
        this.notify('filter'); 
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

    promoteToExplicit(type) {
        if (!this.explicitTypes.includes(type)) {
            this.explicitTypes.push(type);
            if (!this.typeColors[type]) {
                this.typeColors[type] = d3.interpolateRainbow(Math.random());
            }
            this.notify('filter');
        }
    },

    demoteToOther(type) {
        const idx = this.explicitTypes.indexOf(type);
        if (idx !== -1) {
            this.explicitTypes.splice(idx, 1);
            this.notify('filter');
        }
    },

    updateColor(type, hexColor) {
        this.typeColors[type] = hexColor;
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