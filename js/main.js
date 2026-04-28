import { MapRenderer } from './map.js';
import { UI } from './ui.js';
import { State } from './state.js';
import { API } from './api.js';
import { ChartRenderer } from './chart.js'; 

document.addEventListener('DOMContentLoaded', async () => { // 注意这里加了 async
    console.log("Main activating");
    
    // 【唯一新增】：启动时，先把 CSV 和 JSON 吃进内存！
    await API.init(); 

    UI.init();

    MapRenderer.init(() => {
        State.subscribe(async (filters, bounds, source) => {
            if (source === 'bounds') {
                const microData = await API.fetchCrimes(filters, bounds);
                MapRenderer.updateMicroData(microData);
            } 
            else {
                const [microData, macroData, histData] = await Promise.all([
                    API.fetchCrimes(filters, bounds),
                    API.fetchMacroLayer(filters),
                    API.fetchHistograms(filters) 
                ]);
                
                MapRenderer.updateMicroData(microData);
                if (macroData) MapRenderer.updateMacroData(macroData);
                ChartRenderer.updateAllHistograms(histData, filters);
            }
        });

        window.myMap.on('moveend', () => {
            State.updateBounds(window.myMap.getBounds());
        });
        
        State.mapBounds = window.myMap.getBounds(); 
        State.notify('init'); 
    });
});