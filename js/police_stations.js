export function initPoliceStations(mapInstance) {
    var FALLBACK_STATIONS = [
        { name: '1st District - Central',        address: '1718 S. State St.',           lat: 41.8581, lng: -87.6278 },
        { name: '2nd District - Wentworth',       address: '5101 S. Wentworth Ave.',     lat: 41.8028, lng: -87.6325 },
        { name: '3rd District - Grand Crossing',  address: '7040 S. Cottage Grove Ave.', lat: 41.7675, lng: -87.6061 },
        { name: '4th District - South Chicago',   address: '2255 E. 103rd St.',          lat: 41.7056, lng: -87.5581 },
        { name: '5th District - Calumet',        address: '727 E. 111th St.',           lat: 41.6928, lng: -87.6081 },
        { name: '6th District - Gresham',        address: '7800 S. Racine Ave.',       lat: 41.7517, lng: -87.6542 },
        { name: '7th District - Englewood',      address: '1434 W. 63rd St.',         lat: 41.7789, lng: -87.6658 },
        { name: '8th District - Chicago Lawn',   address: '3420 W. 63rd St.',         lat: 41.7786, lng: -87.7108 },
        { name: '9th District - Deering',        address: '3900 W. Fillmore St.',      lat: 41.8853, lng: -87.7228 },
        { name: '10th District - Ogden',         address: '3315 W. Ogden Ave.',       lat: 41.8503, lng: -87.7064 },
        { name: '11th District - Harrison',      address: '3151 W. Harrison St.',     lat: 41.8744, lng: -87.7031 },
        { name: '12th District - Near West',     address: '1412 S. Blue Island Ave.', lat: 41.8653, lng: -87.6617 },
        { name: '13th District - Jefferson Pk', address: '4640 N. Milwaukee Ave.',    lat: 41.9639, lng: -87.7603 },
        { name: '14th District - Shakespeare',    address: '2150 N. California Ave.',  lat: 41.9206, lng: -87.6975 },
        { name: '15th District - Austin',        address: '5701 W. Madison St.',      lat: 41.8806, lng: -87.7692 },
        { name: '16th District - Albany Pk',    address: '5151 N. Kimball Ave.',     lat: 41.9736, lng: -87.7125 },
        { name: '17th District - Lakeview',      address: '3222 N. Sheffield Ave.',   lat: 41.9417, lng: -87.6536 },
        { name: '18th District - Near North',    address: '1160 N. Larrabee St.',    lat: 41.9036, lng: -87.6397 },
        { name: '19th District - Town Hall',     address: '850 N. Winchester Ave.',   lat: 41.8978, lng: -87.6775 },
        { name: '20th District - Lincoln',       address: '5400 N. Lincoln Ave.',     lat: 41.9808, lng: -87.6947 },
        { name: '22nd District - Morgan Pk',    address: '1900 W. Monterey Ave.',   lat: 41.6931, lng: -87.6731 },
        { name: '25th District - Grand Central', address: '5555 N. Central Ave.',     lat: 41.9825, lng: -87.7681 }
    ];

    var map           = mapInstance;
    var isVisible     = false;
    var stationPopup  = null;
    var stationMarkers = [];

    function injectToggle() {
        if (document.getElementById('police-toggle-wrap')) return;
        var panel = document.querySelector('.right-panel');
        if (!panel) return;

        var wrap = document.createElement('div');
        wrap.id = 'police-toggle-wrap';
        wrap.style.cssText = 'display:flex;align-items:center;justify-content:space-between;' +
                            'padding:10px 14px;border-bottom:1px solid #1e293b;margin-bottom:6px;';

        wrap.innerHTML = '' +
            '<span style="font-size:12px;color:#cbd5e1;font-weight:600;">Police Stations</span>' +
            '<label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer;">' +
                '<input type="checkbox" id="police-toggle-input" style="opacity:0;width:0;height:0;position:absolute;">' +
                '<span id="police-toggle-slider" style="' +
                    'position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;' +
                    'background-color:#334155;transition:.3s;border-radius:22px;' +
                '">' +
                    '<span id="police-toggle-dot" style="' +
                        'position:absolute;height:16px;width:16px;left:3px;bottom:3px;' +
                        'background-color:white;transition:.3s;border-radius:50%;' +
                    '"></span>' +
                '</span>' +
            '</label>';

        var container = document.getElementById('police-toggle-container');
        if (container) {
            container.appendChild(wrap);
            wrap.style.marginBottom = '0';
            wrap.style.padding = '0';
            wrap.style.borderBottom = 'none';
        }

        document.getElementById('police-toggle-input').addEventListener('change', function () {
            isVisible = this.checked;
            updateToggleUI();
            if (isVisible) showStations();
            else hideStations();
        });
    }

    function updateToggleUI() {
        var slider = document.getElementById('police-toggle-slider');
        var dot    = document.getElementById('police-toggle-dot');
        if (!slider || !dot) return;
        if (isVisible) {
            slider.style.backgroundColor = '#3b82f6';
            dot.style.transform = 'translateX(18px)';
        } else {
            slider.style.backgroundColor = '#334155';
            dot.style.transform = 'translateX(0)';
        }
    }

    function getDynamicMarkerSize() {
        if (!map) return 14;
        var z = map.getZoom();
        if (z < 10) return 8;   
        if (z > 15) return 38;      
        return 8 + (z - 10) * 1.2;  
    }

    function updateMarkerSizes() {
        if (!isVisible || stationMarkers.length === 0) return;
        var sizeStr = getDynamicMarkerSize().toFixed(1) + 'px';
        stationMarkers.forEach(function(m) {
            m.getElement().style.fontSize = sizeStr;
        });
    }

    function showStations() {
        if (!map) return;
        window.__CHICAGO_POLICE_STATIONS__ = FALLBACK_STATIONS.slice();
        if (stationMarkers.length > 0) return;

        if (!stationPopup) {
            stationPopup = new maplibregl.Popup({
                closeButton: false, closeOnClick: false,
                offset: {
                    'bottom': [0, -12],
                    'top': [0, 12],
                    'left': [12, 0],
                    'right': [-12, 0]
                },
                className: 'police-popup'
            });
        }

        var initialSizeStr = getDynamicMarkerSize().toFixed(1) + 'px';

        FALLBACK_STATIONS.forEach(function(s) {
            var el = document.createElement('div');
            el.innerHTML = '⭐';
            el.style.cssText = 'font-size: ' + initialSizeStr + '; cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));';

            var marker = new maplibregl.Marker({ element: el })
                .setLngLat([s.lng, s.lat])
                .addTo(map);

            el.addEventListener('mouseenter', function() {
                if (map.getPitch() >= 35) return;

                stationPopup.setHTML(
                    '<div style="background:rgba(15,23,42,0.95);color:#f8fafc;padding:10px 12px;' +
                    'border-radius:8px;min-width:180px;font-family:sans-serif;' +
                    'border:1px solid #eab308;">' +
                        '<div style="font-weight:bold;font-size:13px;color:#fde047;margin-bottom:4px;">' +
                            '⭐ ' + (s.name || 'Police Station') + '</div>' +
                        '<div style="font-size:11px;color:#cbd5e1;">📍 ' + (s.address || '') + '</div>' +
                    '</div>'
                ).setLngLat([s.lng, s.lat]);

                if (!stationPopup.isOpen()) stationPopup.addTo(map);
            });

            el.addEventListener('mouseleave', function() {
                if (stationPopup && stationPopup.isOpen()) stationPopup.remove();
            });

            stationMarkers.push(marker);
        });
    }

    function hideStations() {
        stationMarkers.forEach(function(m) { m.remove(); });
        stationMarkers = []; 
        if (stationPopup) stationPopup.remove();
    }

    map.on('zoom', updateMarkerSizes);

    if (!document.getElementById('police-popup-style')) {
        var st = document.createElement('style');
        st.id = 'police-popup-style';
        st.innerHTML = '.police-popup{pointer-events:none!important;}.police-popup *{pointer-events:none!important;}';
        document.head.appendChild(st);
    }

    injectToggle();
}
