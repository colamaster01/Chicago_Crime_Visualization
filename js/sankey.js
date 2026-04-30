import { API } from './api.js';

export const SankeyPanel = {
    isOpen: false,
    currentAreaId: null,

    init() {
        // 注入 panel 的 HTML 骨架
        const panel = document.createElement('div');
        panel.id = 'sankey-panel';
        panel.innerHTML = `
            <div id="sankey-header">
                <div>
                    <div id="sankey-title">Community Crime Flow</div>
                    <div id="sankey-subtitle">Crime Type → Time of Day</div>
                </div>
                <button id="sankey-close">✕</button>
            </div>
            <div id="sankey-body">
                <div id="sankey-loading">Loading...</div>
                <svg id="sankey-svg"></svg>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('sankey-close').addEventListener('click', () => this.close());

        this._injectStyles();
    },

    async open(areaId, communityName, filters) {
        this.currentAreaId = areaId;
        this.isOpen = true;

        // 更新标题
        document.getElementById('sankey-title').textContent = communityName;
        
        // 显示 loading 状态
        document.getElementById('sankey-loading').style.display = 'flex';
        document.getElementById('sankey-svg').style.display = 'none';
        document.getElementById('sankey-panel').classList.add('open');

        console.log('SankeyPanel.open called', { areaId, communityName, filters });

        // 拉数据
        const data = await API.fetchSankey(areaId, filters);
        if (!data || data.links.length === 0) {
            document.getElementById('sankey-loading').textContent = 'No data available.';
            return;
        }

        document.getElementById('sankey-loading').style.display = 'none';
        document.getElementById('sankey-svg').style.display = 'block';

        this._render(data);
    },

    close() {
        this.isOpen = false;
        document.getElementById('sankey-panel').classList.remove('open');
    },

    _render({ nodes, links }) {
        const container = document.getElementById('sankey-body');
        const W = container.clientWidth - 32; // 左右各留 16px padding
        const H = Math.max(400, nodes.length * 28);

        const svg = d3.select('#sankey-svg')
            .attr('width', W)
            .attr('height', H);

        svg.selectAll('*').remove(); // 清空上次渲染

        // ── 构建 sankey layout ──
        const sankey = d3.sankey()
            .nodeWidth(14)
            .nodePadding(10)
            .nodeSort((a, b) => {
                const ORDER = ['Late Night', 'Morning', 'Afternoon', 'Night'];
                const ai = ORDER.indexOf(a.name);
                const bi = ORDER.indexOf(b.name);
                // 不在时间列表里的（犯罪类型）保持原顺序
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 0;
                if (bi === -1) return 0;
                return ai - bi;
            })
            .extent([[0, 0], [W, H]]);

        // d3-sankey 需要深拷贝，否则会污染原始数据
        const graph = sankey({
            nodes: nodes.map(d => ({ ...d })),
            links: links.map(d => ({ ...d }))
        });

        const TIME_COLORS = {
            'Late Night': '#6366f1',
            'Morning':    '#f59e0b',
            'Afternoon':  '#10b981',
            'Night':      '#3b82f6'
        };

        const TYPE_COLORS = [
            '#f87171','#fb923c','#fbbf24','#a3e635',
            '#34d399','#22d3ee','#818cf8','#e879f9','#94a3b8'
        ];

        // 给节点上色
        graph.nodes.forEach((node, i) => {
            node.color = TIME_COLORS[node.name] 
                || TYPE_COLORS[i % TYPE_COLORS.length];
        });

        // ── 渲染 links ──
        svg.append('g')
            .selectAll('path')
            .data(graph.links)
            .join('path')
            .attr('d', d3.sankeyLinkHorizontal())
            .attr('stroke', d => d.source.color)
            .attr('stroke-width', d => Math.max(1, d.width))
            .attr('fill', 'none')
            .attr('opacity', 0.35)
            .on('mouseover', function() { d3.select(this).attr('opacity', 0.65); })
            .on('mouseout',  function() { d3.select(this).attr('opacity', 0.35); });

        // ── 渲染 nodes ──
        const nodeG = svg.append('g')
            .selectAll('g')
            .data(graph.nodes)
            .join('g');

        nodeG.append('rect')
            .attr('x', d => d.x0)
            .attr('y', d => d.y0)
            .attr('width',  d => d.x1 - d.x0)
            .attr('height', d => Math.max(1, d.y1 - d.y0))
            .attr('fill', d => d.color)
            .attr('rx', 3);

        // ── 节点标签 ──
        nodeG.append('text')
            .attr('x', d => d.x0 < W / 2 ? d.x1 + 6 : d.x0 - 6) // 左侧节点标签在右，右侧在左
            .attr('y', d => (d.y0 + d.y1) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', d => d.x0 < W / 2 ? 'start' : 'end')
            .attr('fill', '#cbd5e1')
            .attr('font-size', 11)
            .text(d => {
                const total = links
                    .filter(l => nodes[l.source]?.name === d.name || nodes[l.target]?.name === d.name)
                    .reduce((sum, l) => sum + l.value, 0);
                return `${d.name} (${total.toLocaleString()})`;
            });
    },

    _injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #sankey-panel {
                position: fixed;
                top: 0; right: 0;
                width: 380px; height: 100vh;
                background: rgba(15, 23, 42, 0.97);
                border-left: 1px solid #1e293b;
                transform: translateX(100%);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                z-index: 1000;
                display: flex;
                flex-direction: column;
                font-family: sans-serif;
            }
            #sankey-panel.open {
                transform: translateX(0);
            }
            #sankey-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid #1e293b;
                flex-shrink: 0;
            }
            #sankey-title {
                color: #f8fafc;
                font-size: 16px;
                font-weight: bold;
            }
            #sankey-subtitle {
                color: #64748b;
                font-size: 11px;
                margin-top: 2px;
            }
            #sankey-close {
                background: none;
                border: none;
                color: #64748b;
                font-size: 18px;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
                transition: color 0.2s;
            }
            #sankey-close:hover { color: #f8fafc; }
            #sankey-body {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }
            #sankey-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 200px;
                color: #64748b;
                font-size: 13px;
            }
        `;
        document.head.appendChild(style);
    }
};