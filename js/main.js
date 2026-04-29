import { MapRenderer } from './map.js';
import { UI } from './ui.js';
import { State } from './state.js';
import { API } from './api.js';
import { ChartRenderer } from './chart.js'; 

document.addEventListener('DOMContentLoaded', async () => { 
    console.log("Main activating");
    
    const loaderText = document.getElementById('loader-text');
    
    try {
        // 1. 等待 PapaParse 流式解析 170 万条数据 (这期间用户只能看到狂飙的数字，无法乱点)
        await API.init(); 
        
        if(loaderText) loaderText.innerText = "Rendering map and charts...";

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
            
            // 👈 【核心】：所有东西都准备就绪了，开始解除封印！
            const loader = document.getElementById('global-loader');
            if (loader) {
                // 先触发 CSS 渐隐动画，显得丝滑高级
                loader.style.opacity = '0';
                // 0.5秒动画播完后，把这个遮罩彻底从 DOM 树里销毁，用户可以开始操作了
                setTimeout(() => loader.remove(), 500);
            }
        });
    } catch (error) {
        if(loaderText) loaderText.innerText = "Error loading data. Please refresh.";
        console.error(error);
    }
});