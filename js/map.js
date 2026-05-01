const ZOOM_THRESHOLD = 12.5; 

const INITIAL_CENTER = [-87.7, 41.83];
const INITIAL_ZOOM = 9.6;
const INITIAL_PITCH = 0;
const INITIAL_BEARING = 0;

class HomeButtonControl {
    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        
        const button = document.createElement('button');
        button.className = 'maplibregl-ctrl-icon';
        button.type = 'button';
        button.title = 'Reset to Chicago View';
        button.style.cursor = 'pointer';
        button.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin: 6px auto; display: block; color: #333;">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
        `;

        button.addEventListener('click', () => {
            this.map.flyTo({
                center: INITIAL_CENTER,
                zoom: INITIAL_ZOOM,
                pitch: INITIAL_PITCH,
                bearing: INITIAL_BEARING,
                essential: true 
            });
        });

        this.container.appendChild(button);
        return this.container;
    }
    onRemove() {
        this.container.parentNode.removeChild(this.container);
        this.map = undefined;
    }
}


export const MapRenderer = {
    map: null, popup: null, isLoaded: false, 
    deckOverlay: null,      
    currentMacroData: null, 
    is3DActive: false,
    isMacroVisible: true, 
    hoveredAreaId: null, 

    init(onReadyCallback) {
        this.map = new maplibregl.Map({
            container: 'map', 
            style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', 
            center: INITIAL_CENTER, 
            zoom: INITIAL_ZOOM,
            pitch: INITIAL_PITCH,
            bearing: INITIAL_BEARING
        });
        
        this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
        
        this.map.addControl(new HomeButtonControl(), 'top-right');

        this.popup = new maplibregl.Popup({ 
            closeButton: false, closeOnClick: false, anchor: 'bottom', offset: [0,-20], 
            className: 'ghost-popup'
        });

        if (!document.getElementById('ghost-popup-style')) {
            const style = document.createElement('style');
            style.id = 'ghost-popup-style';
            style.innerHTML = `
                .ghost-popup { pointer-events: none !important; }
                .ghost-popup * { pointer-events: none !important; }
            `;
            document.head.appendChild(style);
        }

        this.map.on('load', () => {
            this.isLoaded = true;
            this.setupLayers();       
            this.setupInteractions(); 
            this.setupDeckGL();       
            if(onReadyCallback) onReadyCallback();
        });
        window.myMap = this.map; 
        this.onCommunityClick = null;
    },

    setupDeckGL() {
        this.deckOverlay = new deck.MapboxOverlay({
            interleaved: true, 
            layers: []         
        });
        this.map.addControl(this.deckOverlay);
    },

    setupLayers() {
        this.map.addSource('macro-areas', { type: 'geojson', data: { type: "FeatureCollection", features: [] } });

        this.map.addLayer({
            id: 'area-fill', type: 'fill', source: 'macro-areas', maxzoom: ZOOM_THRESHOLD,
            paint: { 
                'fill-color': '#1e293b', 
                'fill-opacity': 0.75, 
                'fill-opacity-transition': { duration: 600 } 
            } 
        });
        
        this.map.addLayer({ id: 'area-borders', type: 'line', source: 'macro-areas', maxzoom: ZOOM_THRESHOLD, paint: { 'line-color': '#475569', 'line-width': 1.0, 'line-opacity': 0.6 } });
        
        this.map.addLayer({ id: 'community-labels', type: 'symbol', source: 'macro-areas', maxzoom: ZOOM_THRESHOLD, layout: { 'text-field': ['get', 'community'], 'text-size': 11, 'text-justify': 'center' }, paint: { 'text-color': '#cbd5e1', 'text-halo-color': '#0f172a', 'text-halo-width': 1.5 } });

        this.map.addSource('micro-points', { type: 'geojson', data: { type: "FeatureCollection", features: [] }, cluster: true, clusterMaxZoom: 15, clusterRadius: 180 });
        this.map.addLayer({
            id: 'clusters', type: 'circle', source: 'micro-points', minzoom: ZOOM_THRESHOLD, filter: ['has', 'point_count'],
            paint: {
                'circle-color': [ 'step', ['get', 'point_count'], '#ffe066', 1000, '#ffb700', 5000, '#ff7b00', 20000, '#f44336', 50000, '#b71c1c' ],
                'circle-radius': [ 'step', ['get', 'point_count'], 25, 500, 30, 1000, 40, 5000, 45, 10000, 50 ],
                'circle-stroke-width': 3, 'circle-stroke-color': 'rgba(255, 255, 255, 0.8)'
            }
        });
        this.map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'micro-points', minzoom: ZOOM_THRESHOLD, filter: ['has', 'point_count'], layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 15 }, paint: { 'text-color': '#000000' } });
        
        this.map.addLayer({
            id: 'unclustered-point', type: 'circle', source: 'micro-points', minzoom: ZOOM_THRESHOLD, filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': ['get', 'color'],
                'circle-radius': 6, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff'
            }
        });
    },

    createMacroPopupHtml(props) {
        const total = props.crime_count || 0;
        const score = props.severity_score || 0; 
        const rank = props.rank || '?';
        const totalAreas = props.total_areas || 77; 
        
        let topCrimes = [];
        if (props.top_crimes_json) topCrimes = JSON.parse(props.top_crimes_json);
    
        const rowsHtml = topCrimes.map(c => {
            const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
            return `
                <div style="margin-top: 5px;">
                    <div style="display: flex; justify-content: space-between; font-size: 10px; line-height: 1.2;">
                        <span style="color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px;">${c.type}</span>
                        <span style="color: #94a3b8;">${c.count.toLocaleString()} (${pct}%)</span>
                    </div>
                    <div style="width: 100%; background: #334155; height: 3px; border-radius: 2px; margin-top: 2px;">
                        <div style="width: ${pct}%; background: #4ade80; height: 100%; border-radius: 2px;"></div>
                    </div>
                </div>`;
        }).join('');
    
        return `
            <div style="background: rgba(15, 23, 42, 0.95); color: #f8fafc; padding: 10px; border-radius: 8px; width: 160px; border: 1px solid #334155; font-family: sans-serif;">
                <div style="font-weight: bold; border-bottom: 1px solid #334155; padding-bottom: 5px; margin-bottom: 8px; font-size: 13px;">
                    ${props.community || 'Unknown'}
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center; background: rgba(59, 130, 246, 0.1); padding: 4px; border-radius: 4px; border: 1px solid rgba(59, 130, 246, 0.2);">
                    <span style="color: #93c5fd; font-size: 11px; font-weight: bold;">Severity Index</span>
                    <span style="color: #60a5fa; font-weight: 900; font-size: 14px;">${score}<span style="font-size:9px; color:#64748b;">/100</span></span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #94a3b8; font-size: 10px;">
                    <span>Raw Cases</span>
                    <span style="color: #cbd5e1; font-weight: bold;">${total.toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #94a3b8; font-size: 10px;">
                    <span>Danger Rank</span>
                    <span style="color: ${rank <= 10 ? '#f87171' : rank <= 30 ? '#fbbf24' : '#86efac'}; font-weight: bold;">
                        #${rank} / ${totalAreas}
                    </span>
                </div>
                <div style="border-top: 1px solid #1e293b; padding-top: 5px;">
                    ${rowsHtml || '<div style="color: #64748b; font-size: 10px;">Waiting for data...</div>'}
                </div>
            </div>
        `;
    },

    setupInteractions() {
        this.map.on('mouseenter', 'area-fill', () => { 
            if (!this.is3DActive) this.map.getCanvas().style.cursor = 'pointer'; 
        });
        
        this.map.on('mouseleave', 'area-fill', () => { 
            if (!this.is3DActive) {
                this.map.getCanvas().style.cursor = ''; 
                this.popup.remove();
                this.hoveredAreaId = null; 
            }
        });

        this.map.on('mousemove', 'area-fill', (e) => {
            if (this.is3DActive) return; 
            const props = e.features[0].properties;
            const areaId = props.area_num_1;

            if (this.hoveredAreaId !== areaId) {
                this.hoveredAreaId = areaId;
                const html = this.createMacroPopupHtml(props);
                this.popup.setHTML(html);
            }
            
            this.popup.setLngLat(e.lngLat);
            if (!this.popup.isOpen()) this.popup.addTo(this.map); 
        });

        this.map.on('click', 'area-fill', (e) => {
            if (this.is3DActive) return; 
            const props = e.features[0].properties;
            if (this.onCommunityClick) this.onCommunityClick(parseInt(props.area_num_1), props.community || 'Unknown');
        });

        this.map.on('pitch', () => {
            const pitch = this.map.getPitch();
            const threshold = 35; 

            if (pitch >= threshold && !this.is3DActive) {
                this.is3DActive = true;
                this.map.setPaintProperty('area-fill', 'fill-opacity', 0.2);
                this.popup.remove();
                this.hoveredAreaId = null; 
                this.renderDeckLayer(); 
            } 
            else if (pitch < threshold && this.is3DActive) {
                this.is3DActive = false;
                this.map.setPaintProperty('area-fill', 'fill-opacity', 0.75);
                this.popup.remove();
                this.hoveredAreaId = null;
                this.renderDeckLayer(); 
            }
        });

        this.map.on('zoom', () => {
            const zoom = this.map.getZoom();
            const isVisible = zoom < ZOOM_THRESHOLD; 
            if (this.isMacroVisible !== isVisible) {
                this.isMacroVisible = isVisible;
                this.renderDeckLayer();

                const legend = document.getElementById('severity-legend');
                if (legend) {
                    legend.style.opacity = isVisible ? '1' : '0';
                    legend.style.visibility = isVisible ? 'visible' : 'hidden';
                }
            }
        });

        this.map.on('mouseenter', 'clusters', () => { this.map.getCanvas().style.cursor = 'pointer'; });
        this.map.on('mouseleave', 'clusters', () => { this.map.getCanvas().style.cursor = ''; });
        
        this.map.on('click', 'clusters', (e) => {
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            if (!features.length) return;
            
            const currentZoom = this.map.getZoom();
            const safeZoom = Math.min(currentZoom + 2, 18);
            
            this.map.easeTo({ 
                center: features[0].geometry.coordinates, 
                zoom: safeZoom 
            });
        });

        this.map.on('mouseenter', 'unclustered-point', () => { this.map.getCanvas().style.cursor = 'pointer'; });
        this.map.on('mouseleave', 'unclustered-point', () => { 
            this.map.getCanvas().style.cursor = ''; 
            this.popup.remove(); 
            this.hoveredAreaId = null;
        });
        
        this.map.on('mousemove', 'unclustered-point', (e) => {
            const props = e.features[0].properties;
            const pointId = e.features[0].geometry.coordinates.join(',');

            if (this.hoveredAreaId !== pointId) {
                this.hoveredAreaId = pointId;
                const html = `
                    <div style="background: rgba(15, 23, 42, 0.95); color: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #334155; font-family: sans-serif; max-width: 220px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                        <strong style="color:#ef4444; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">${props.type}</strong>
                        <div style="color:#e2e8f0; font-weight: 500; font-size: 12px; margin-bottom: 6px; line-height: 1.4;">${props.desc || 'No specific description'}</div>
                        <div style="border-top: 1px solid #1e293b; padding-top: 6px; color:#94a3b8; font-size: 11px;">🕒 ${props.date}</div>
                    </div>
                `;
                this.popup.setHTML(html);
            }
            this.popup.setLngLat(e.features[0].geometry.coordinates);
            if (!this.popup.isOpen()) this.popup.addTo(this.map);
        });
    },
    
    updateMacroData(macroData) {
        if (!this.isLoaded || !macroData || !this.map.getSource('macro-areas')) return;
        this.currentMacroData = macroData; 
        this.map.getSource('macro-areas').setData(macroData.geoJson);

        if (macroData.isEmpty) {
            this.map.setPaintProperty('area-fill', 'fill-color', '#1e293b');
        } else {
            const t = macroData.thresholds;
            const colorRamp = [
                'step', ['get', 'severity_score'],
                '#1a9850', t.p20, '#a6d96a', t.p40, '#fee08b', t.p60, '#fc8d59', t.p80, '#d73027'
            ];
            this.map.setPaintProperty('area-fill', 'fill-color', colorRamp);
        }
        
        this.renderDeckLayer(); 
    },

    renderDeckLayer() {
        if (!this.deckOverlay || !this.currentMacroData) return;

        const data = this.currentMacroData;
        const isEmpty = data.isEmpty; 
        const t = data.thresholds;

        const getColor = (score) => {
            if (isEmpty) return [30, 41, 59]; 
            
            if (score < t.p20) return [26, 152, 80];        
            if (score < t.p40) return [166, 217, 106];      
            if (score < t.p60) return [254, 224, 139];      
            if (score < t.p80) return [252, 141, 89];       
            return [215, 48, 39];                           
        };

        const polygonData = data.geoJson.features.map(f => {
            const center = d3.geoCentroid(f);
            const radiusKm = 0.35; 
            const points = 36;
            const coords = [];
            const kmPerDegreeLat = 111.32;
            const kmPerDegreeLng = 40075 * Math.cos(center[1] * Math.PI / 180) / 360;
            
            for (let i = 0; i < points; i++) {
                const theta = (i / points) * (2 * Math.PI);
                const dx = (radiusKm * Math.cos(theta)) / kmPerDegreeLng;
                const dy = (radiusKm * Math.sin(theta)) / kmPerDegreeLat;
                coords.push([center[0] + dx, center[1] + dy]);
            }
            coords.push(coords[0]); 
            
            return {
                polygon: [coords], 
                score: f.properties.severity_score || 0,
                color: getColor(f.properties.severity_score || 0),
                properties: f.properties 
            };
        });

        // 这个变量不仅控制高度是否显示，也决定了是否要把柱状图绘制出来
        const shouldShowColumns = this.is3DActive && this.isMacroVisible;

        const extrusionLayer = new deck.PolygonLayer({
            id: '3d-severity-polygons',
            data: polygonData,
            extruded: true,
            stroked: false,      
            
            // 👑 核心修复：只有处于 3D 模式下，这个隐藏的圆盘才能被鼠标触碰（pickable）！
            pickable: shouldShowColumns,         
            autoHighlight: true,    
            highlightColor: [255, 255, 255, 60], 

            getPolygon: d => d.polygon,
            getElevation: d => (shouldShowColumns && !isEmpty) ? d.score * 120 : 0, 
            getFillColor: d => [...d.color, shouldShowColumns ? 255 : 0], 

            onHover: (info) => {
                if (shouldShowColumns && !isEmpty && info.object) {
                    this.map.getCanvas().style.cursor = 'pointer';
                    const props = info.object.properties;
                    const areaId = props.area_num_1;

                    if (this.hoveredAreaId !== areaId) {
                        this.hoveredAreaId = areaId;
                        const html = this.createMacroPopupHtml(props);
                        this.popup.setHTML(html);
                    }
                    
                    this.popup.setLngLat(info.coordinate);
                    if (!this.popup.isOpen()) this.popup.addTo(this.map);
                    
                } else if (shouldShowColumns) {
                    this.map.getCanvas().style.cursor = '';
                    this.popup.remove();
                    this.hoveredAreaId = null;
                }
            },

            onClick: (info) => {
                if (shouldShowColumns && !isEmpty && info.object) {
                    const props = info.object.properties;
                    if (this.onCommunityClick) this.onCommunityClick(parseInt(props.area_num_1), props.community || 'Unknown');
                }
            },

            // 必须把 shouldShowColumns 加入触发更新的依赖中
            updateTriggers: {
                getElevation: [this.is3DActive, this.isMacroVisible, isEmpty],
                getFillColor: [this.is3DActive, this.isMacroVisible, isEmpty],
                pickable: [this.is3DActive, this.isMacroVisible]
            },

            material: {
                ambient: 0.35,   
                diffuse: 0.65,   
                shininess: 32,   
                specularColor: [255, 255, 255] 
            },
            
            transitions: {
                getElevation: { duration: 800, easing: d3.easeCubicOut },
                getFillColor: { duration: 500 } 
            }
        });

        this.deckOverlay.setProps({
            layers: [extrusionLayer]
        });
    },

    updateMicroData(geoJsonData) {
        if (this.isLoaded && this.map.getSource('micro-points')) this.map.getSource('micro-points').setData(geoJsonData);
    }
};