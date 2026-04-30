import { MapRenderer } from './map.js';
import { UI } from './ui.js';
import { State } from './state.js';
import { API } from './api.js';
import { ChartRenderer } from './chart.js'; 
import { SankeyPanel } from './sankey.js';

document.addEventListener('DOMContentLoaded', async () => { 
    console.log("Main activating");
    
    const loaderText = document.getElementById('loader-text');
    
    try {
        await API.init(); 
        
        if(loaderText) loaderText.innerText = "Rendering map and charts...";

        UI.init();

        MapRenderer.init(() => {
            State.subscribe(async (filters, bounds, source) => {
                
                // 👇 每次更新时，实时捕获当前的缩放层级
                const currentZoom = window.myMap ? window.myMap.getZoom() : 0;

                if (source === 'bounds') {
                    // 将 currentZoom 传给底层
                    const microData = await API.fetchCrimes(filters, bounds, currentZoom);
                    MapRenderer.updateMicroData(microData);
                } 
                else {
                    const [microData, macroData, histData] = await Promise.all([
                        // 将 currentZoom 传给底层
                        API.fetchCrimes(filters, bounds, currentZoom),
                        API.fetchMacroLayer(filters),
                        API.fetchHistograms(filters) 
                    ]);
                    
                    MapRenderer.updateMicroData(microData);
                    if (macroData) MapRenderer.updateMacroData(macroData);
                    ChartRenderer.updateAllHistograms(histData, filters);
                    
                    if (SankeyPanel.isOpen) {
                        SankeyPanel.update(filters);
                    }
                }
            });

            window.myMap.on('moveend', () => {
                State.updateBounds(window.myMap.getBounds());
            });
            
            SankeyPanel.init();

            MapRenderer.onCommunityClick = (areaId, communityName) => {
                const filters = State.filters; 
                SankeyPanel.open(areaId, communityName, filters);
            };
            
            State.mapBounds = window.myMap.getBounds(); 
            State.notify('init'); 
            
            const loader = document.getElementById('global-loader');
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => loader.remove(), 500);
            }
        });
    } catch (error) {
        if(loaderText) loaderText.innerText = "Error loading data. Please refresh.";
        console.error(error);
    }
});