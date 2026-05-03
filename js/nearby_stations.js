var FALLBACK_STATIONS = [
    { name: '1st District - Central',        lat: 41.8581, lng: -87.6278 },
    { name: '2nd District - Wentworth',       lat: 41.8028, lng: -87.6325 },
    { name: '3rd District - Grand Crossing',  lat: 41.7675, lng: -87.6061 },
    { name: '4th District - South Chicago',   lat: 41.7056, lng: -87.5581 },
    { name: '5th District - Calumet',        lat: 41.6928, lng: -87.6081 },
    { name: '6th District - Gresham',        lat: 41.7517, lng: -87.6542 },
    { name: '7th District - Englewood',      lat: 41.7789, lng: -87.6658 },
    { name: '8th District - Chicago Lawn',   lat: 41.7786, lng: -87.7108 },
    { name: '9th District - Deering',        lat: 41.8853, lng: -87.7228 },
    { name: '10th District - Ogden',         lat: 41.8503, lng: -87.7064 },
    { name: '11th District - Harrison',      lat: 41.8744, lng: -87.7031 },
    { name: '12th District - Near West',     lat: 41.8653, lng: -87.6617 },
    { name: '13th District - Jefferson Pk',  lat: 41.9639, lng: -87.7603 },
    { name: '14th District - Shakespeare',    lat: 41.9206, lng: -87.6975 },
    { name: '15th District - Austin',        lat: 41.8806, lng: -87.7692 },
    { name: '16th District - Albany Park',   lat: 41.9736, lng: -87.7125 },
    { name: '17th District - Lakeview',      lat: 41.9417, lng: -87.6536 },
    { name: '18th District - Near North',    lat: 41.9036, lng: -87.6397 },
    { name: '19th District - Town Hall',     lat: 41.8978, lng: -87.6775 },
    { name: '20th District - Lincoln',       lat: 41.9808, lng: -87.6947 },
    { name: '22nd District - Morgan Pk',     lat: 41.6931, lng: -87.6731 },
    { name: '25th District - Grand Central', lat: 41.9825, lng: -87.7681 }
];

var stationData = null;

function fetchStations(callback) {
    if (stationData) { callback(stationData); return; }
    if (window.__CHICAGO_POLICE_STATIONS__) {
        stationData = window.__CHICAGO_POLICE_STATIONS__;
        callback(stationData);
        return;
    }
    stationData = FALLBACK_STATIONS.slice();
    window.__CHICAGO_POLICE_STATIONS__ = stationData;
    callback(stationData);
}

function haversineKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fetchRoute(origin, destination, callback) {
    var url = 'https://router.project-osrm.org/route/v1/driving/' +
        origin.lng + ',' + origin.lat + ';' +
        destination.lng + ',' + destination.lat +
        '?overview=false&annotations=true';
    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.code === 'Ok' && data.routes && data.routes[0]) {
                var route = data.routes[0];
                callback(null, {
                    distanceKm:  (route.distance / 1000).toFixed(2),
                    durationMin: (route.duration / 60).toFixed(1)
                });
            } else {
                callback(null, null);
            }
        })
        .catch(function () { callback(null, null); });
}

function buildOriginPopupHtml(top2) {
    var html = '<div style="font-family:sans-serif;font-size:11px;' +
        'color:#e2e8f0;min-width:200px;' +
        'background:rgba(15,23,42,0.95);padding:8px 10px;border-radius:8px;' +
        'box-shadow:0 2px 12px rgba(0,0,0,0.6);">' +
        '<div style="font-weight:bold;font-size:13px;margin-bottom:6px;' +
        'color:#facc15;border-bottom:1px solid #334155;padding-bottom:4px;">' +
        '📍 Nearest Police Stations</div>';

    top2.forEach(function (item, i) {
        var colors = ['#22c55e', '#f59e0b']; 
        var c = colors[i] || '#94a3b8';
        html += '<div style="margin-bottom:6px;padding-bottom:5px;' +
            (i < 1 ? 'border-bottom:1px solid #1e293b;' : '') + '">' +
                '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">' +
                    '<span style="color:' + c + ';font-size:12px;">●</span>' +
                    '<span style="font-weight:bold;font-size:11px;">' +
                        (i + 1) + '. ' + item.name + '</span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;' +
                    'font-size:10px;color:#94a3b8;margin-bottom:1px;">' +
                    '<span>📏 Straight</span>' +
                    '<span>' + item.straightKm + ' km</span>' +
                '</div>' +
                (item.routeKm
                    ? '<div style="display:flex;justify-content:space-between;' +
                          'font-size:10px;color:#cbd5e1;">' +
                          '<span>🚗 Driving</span>' +
                          '<span>' + item.routeKm + ' km (~' + item.durationMin + ' min)</span>' +
                        '</div>'
                    : '<div style="font-size:9px;color:#64748b;">(route unavailable)</div>') +
            '</div>';
    });

    html += '<div style="font-size:9px;color:#475569;text-align:center;margin-top:2px;">' +
            '⚡ Response ≈ driving time from nearest</div>' +
        '</div>';
    return html;
}

export function calculateNearbyStationsHTML(point, callback) {
    fetchStations(function (stations) {
        var list = stations.map(function (s) {
            return {
                name: s.name,
                lat: s.lat, lng: s.lng,
                straightKm: haversineKm(point.lat, point.lng, s.lat, s.lng).toFixed(2)
            };
        }).sort(function (a, b) { return parseFloat(a.straightKm) - parseFloat(b.straightKm); });

        var top2 = list.slice(0, 2);
        var origin = { lat: point.lat, lng: point.lng };
        var pending = top2.length;

        top2.forEach(function (item, i) {
            fetchRoute(origin, { lat: item.lat, lng: item.lng }, function (err, info) {
                if (info) {
                    item.routeKm    = info.distanceKm;
                    item.durationMin = info.durationMin;
                }
                pending--;
                if (pending <= 0) {
                    var html = buildOriginPopupHtml(top2);
                    callback(html);
                }
            });
        });
    });
}