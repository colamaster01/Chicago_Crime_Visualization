export const State = {
    filters: {
        // 全选状态即为数组两端的极值
        year: [2020, 2026],
        month: [1, 12],  
        time: [0, 24], // 👈 【核心】：合并为单一时间维度（浮点数 0.0 ~ 24.0）
        crimeTypes: ['THEFT', 'BATTERY', 'CRIMINAL DAMAGE', 'NARCOTICS', 'ASSAULT', 'BURGLARY', 'ROBBERY', 'MOTOR VEHICLE THEFT', 'HOMICIDE', 'OTHER'] 
    },
    
    mapBounds: null, 
    listeners: [],

    updateFilter(key, valueArray) {
        this.filters[key] = valueArray;
        this.notify('filter'); 
    },

    updateCrimeTypes(typesArray) {
        this.filters.crimeTypes = typesArray;
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