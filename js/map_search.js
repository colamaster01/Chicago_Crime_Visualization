import { calculateNearbyStationsHTML } from './nearby_stations.js';

export function initMapSearch(mapInstance) {
    var map = mapInstance;
    var isSelectMode  = false;
    var selectMarker   = null;     
    var selectPopup    = null; 
    var searchWrap     = null;
    var resultList     = null;
    var selectBtn      = null;
    var endSelectBtn   = null;
    var isFlying       = false; 
    var NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&address_details=1&dedupe=1&q=';

    class MapSearchControl {
        onAdd(mapInstance) {
            this._map = mapInstance;
            this._container = document.createElement('div');
            this._container.style.cssText = 'position: absolute; top: 10px; right: 50px; display: flex; flex-direction: column; gap: 6px; z-index: 10; pointer-events: auto;';

            searchWrap = this._container;

            var input = document.createElement('input');
            input.id = 'map-search-input';
            input.type = 'text';
            input.placeholder = '🔍 Search a place in Chicago...';
            input.setAttribute('autocomplete', 'off');
            input.style.cssText = 'width:280px; padding:8px 12px; border-radius:6px; border:1px solid #334155; background:rgba(15,23,42,0.92); color:#f8fafc; font-size:13px; outline:none; font-family:sans-serif; box-shadow:0 4px 12px rgba(0,0,0,0.5);';

            resultList = document.createElement('div');
            resultList.id = 'map-search-results';
            resultList.style.cssText = 'display:none; background:rgba(15,23,42,0.96); border:1px solid #334155; border-radius:6px; max-height:220px; overflow-y:auto; width:280px; font-family:sans-serif; box-shadow:0 4px 12px rgba(0,0,0,0.5);';

            selectBtn = document.createElement('button');
            selectBtn.id = 'map-select-btn';
            selectBtn.textContent = '📍 Select on Map';
            
            var initialSelectDisplay = this._map.getZoom() >= 12.5 ? 'block' : 'none';
            selectBtn.style.cssText = 'padding:6px 12px; border-radius:6px; cursor:pointer; background:#1e293b; color:#cbd5e1; border:1px solid #334155; font-size:12px; font-family:sans-serif; text-align:left; box-shadow:0 4px 12px rgba(0,0,0,0.5); display:' + initialSelectDisplay + ';';

            endSelectBtn = document.createElement('button');
            endSelectBtn.id = 'map-end-select-btn';
            endSelectBtn.textContent = '✖ End Select Mode';
            endSelectBtn.style.cssText = 'display:none; padding:6px 12px; border-radius:6px; cursor:pointer; background:#dc2626; color:white; border:none; box-shadow:0 4px 12px rgba(0,0,0,0.5); font-size:12px; font-family:sans-serif;';

            this._container.appendChild(input);
            this._container.appendChild(resultList);
            this._container.appendChild(selectBtn);
            this._container.appendChild(endSelectBtn);

            var debounceTimer = null;
            input.addEventListener('input', function () {
                clearTimeout(debounceTimer);
                var q = input.value.trim();
                if (q.length < 2) { resultList.style.display = 'none'; return; }
                debounceTimer = setTimeout(function () { fetchSuggestions(q); }, 350);
            });

            input.addEventListener('blur', function () {
                setTimeout(function () {
                    var active = document.activeElement;
                    if (active === input) return;                      
                    if (resultList.contains(active)) return;           
                    resultList.style.display = 'none';
                }, 250);
            });

            input.addEventListener('focus', function () {
                if (resultList.children.length > 0) resultList.style.display = 'block';
            });

            selectBtn.addEventListener('click', enterSelectMode);
            endSelectBtn.addEventListener('click', exitSelectMode);

            return this._container;
        }

        onRemove() {
            this._container.parentNode.removeChild(this._container);
            this._map = undefined;
        }
    }

    function initControl() {
        map.addControl(new MapSearchControl());

        map.on('zoom', function () {
            if (isFlying) return; 

            if (map.getZoom() >= 12.5) {
                if (isSelectMode || selectMarker) {
                    if (selectBtn) selectBtn.style.display = 'none';
                    if (endSelectBtn) endSelectBtn.style.display = 'block';
                } else {
                    if (selectBtn) selectBtn.style.display = 'block';
                    if (endSelectBtn) endSelectBtn.style.display = 'none';
                }
            } else {
                if (selectBtn) selectBtn.style.display = 'none';
                if (endSelectBtn) endSelectBtn.style.display = 'none';
                exitSelectMode();
            }
        });
    }

    var lastFetchReq = 0;
    function fetchSuggestions(query) {
        lastFetchReq++;
        var thisReq = lastFetchReq;
        var bbox = '&bounded=1&viewbox=-88.0,42.1,-87.5,41.6';
        var url = NOMINATIM_URL + encodeURIComponent(query + ' Chicago') + bbox;

        fetch(url).then(function (r) {
            if (thisReq !== lastFetchReq) return null; 
            return r.json();
        }).then(function (data) {
            if (!data || thisReq !== lastFetchReq) return;
            renderSuggestions(data);
        }).catch(function () {  });
    }

    function renderSuggestions(items) {
        if(!resultList) return;
        resultList.innerHTML = '';
        if (!items || !items.length) { resultList.style.display = 'none'; return; }

        items.forEach(function (item) {
            var div = document.createElement('div');
            div.style.cssText = 'padding:7px 10px; cursor:pointer; font-size:12px; color:#cbd5e1; border-bottom:1px solid #1e293b;';
            div.textContent = item.display_name.split(',')[0] + ', ' + (item.display_name.split(',')[1] || '');
            div.addEventListener('mouseenter', function () { div.style.background = '#1e293b'; });
            div.addEventListener('mouseleave', function () { div.style.background = 'transparent'; });
            div.addEventListener('mousedown', function (e) {
                e.preventDefault(); 
                resultList.style.display = 'none';
                var lat = parseFloat(item.lat);
                var lng = parseFloat(item.lon);
                
                isFlying = true;
                map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14) });
                
                map.once('moveend', function() {
                    isFlying = false;
                    if (map.getZoom() >= 12.5) {
                        if (selectBtn) selectBtn.style.display = 'none';
                        if (endSelectBtn) endSelectBtn.style.display = 'block';
                    }
                });

                isSelectMode = false;
                if (selectBtn) selectBtn.style.display = 'none';
                if (endSelectBtn) endSelectBtn.style.display = 'block';
                map.getCanvas().style.cursor = '';
                map.off('click', onClickMap); 

                placeRedPinAndCalculate(lng, lat);
            });
            resultList.appendChild(div);
        });
        resultList.style.display = 'block';
    }

    function enterSelectMode() {
        isSelectMode = true;
        if (selectBtn) selectBtn.style.display = 'none';
        if (endSelectBtn) endSelectBtn.style.display = 'block';
        map.getCanvas().style.cursor = 'crosshair';
        map.once('click', onClickMap);
    }

    function exitSelectMode() {
        isSelectMode = false;
        
        if (map && map.getZoom() >= 12.5) {
            if (selectBtn) selectBtn.style.display = 'block';
        } else {
            if (selectBtn) selectBtn.style.display = 'none';
        }
        
        if (endSelectBtn) endSelectBtn.style.display = 'none';
        if (map) {
            map.getCanvas().style.cursor = '';
            map.off('click', onClickMap); 
        }
        
        if (selectMarker) { selectMarker.remove(); selectMarker = null; }
        if (selectPopup) { selectPopup.remove(); selectPopup = null; }
    }

    function onClickMap(e) {
        if (!isSelectMode) return;
        map.once('click', onClickMap);
        placeRedPinAndCalculate(e.lngLat.lng, e.lngLat.lat);
    }

    function placeRedPinAndCalculate(lng, lat) {
        if (selectMarker) selectMarker.remove();
        if (selectPopup) selectPopup.remove();

        var el = document.createElement('div');
        el.innerHTML = '📍';
        el.style.cssText = 'font-size:28px; cursor:move; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));';
        var hint = document.createElement('div');
        hint.style.cssText = 'position:absolute; bottom:36px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.9); color:#94a3b8; font-size:10px; padding:3px 8px; border-radius:4px; white-space:nowrap; pointer-events:none;';
        hint.textContent = 'Drag / Hover for info';
        el.appendChild(hint);

        selectMarker = new maplibregl.Marker({ element: el, draggable: true })
            .setLngLat([lng, lat])
            .addTo(map);

        selectPopup = new maplibregl.Popup({
            closeButton: false, closeOnClick: false,
            offset: {
                'bottom': [0, -32],
                'top': [0, 15],  
                'left': [15, -15],
                'right': [-15, -15]
            },
            maxWidth: '280px'
        });

        calculateNearbyStationsHTML({lng: lng, lat: lat}, function(html) {
            if(selectPopup) selectPopup.setHTML(html);
        });

        el.addEventListener('mouseenter', function () {
            if (selectPopup && selectPopup._content) {
                selectPopup.setLngLat(selectMarker.getLngLat());
                if (!selectPopup.isOpen()) selectPopup.addTo(map);
            }
        });
        
        el.addEventListener('mouseleave', function () {
            if (selectPopup && selectPopup.isOpen()) selectPopup.remove();
        });

        selectMarker.on('dragstart', function() {
            if (selectPopup && selectPopup.isOpen()) selectPopup.remove();
        });

        selectMarker.on('dragend', function () {
            var pos = selectMarker.getLngLat();
            calculateNearbyStationsHTML({lng: pos.lng, lat: pos.lat}, function(html) {
                if(selectPopup) selectPopup.setHTML(html);
            });
        });
    }

    initControl();
}