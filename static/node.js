class Node {
    constructor(x, y, r, label, border, fill, isCentral, isSub, zoom) {
        this.x = x;
        this.y = y;
        this.r = r;
        this.label = label;
        this.border = border;
        this.fill = fill;
        this.isCentral = isCentral;
        this.isSub = isSub;
        this.zoom = zoom;
    }

    render(svg, tooltip, animate = false) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute('class', 'node' + (this.isCentral ? ' central' : ''));

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute('cx', this.x);
        circle.setAttribute('cy', this.y);
        circle.setAttribute('r', this.r);
        circle.setAttribute('stroke', this.border);
        circle.setAttribute('stroke-width', this.isCentral ? 8 * this.zoom : (this.isSub ? 3 * this.zoom : 5 * this.zoom));
        circle.setAttribute('fill', 'none');
        g.appendChild(circle);

        if (animate) {
            const length = 2 * Math.PI * this.r;
            circle.style.strokeDasharray = length;
            circle.style.strokeDashoffset = length;
            circle.style.transition = 'stroke-dashoffset 0.7s cubic-bezier(.4,2,.6,1)';
            setTimeout(() => {
                circle.style.strokeDashoffset = 0;
                setTimeout(() => {
                    circle.setAttribute('fill', this.fill);
                    this._drawText(g, fontSize, lines, true);
                }, 700);
            }, 10);
        } else {
            circle.setAttribute('fill', this.fill);
            this._drawText(g, fontSize, lines, false);
        }

        const maxWidth = this.r * 1.7;
        let fontSize = this.isCentral ? 1.2 : (this.isSub ? 0.8 : 0.95);
        const minFontSize = 0.28;
        const words = this.label.split(' ');
        let lines = [];
        const temp = document.createElementNS("http://www.w3.org/2000/svg", "text");
        temp.setAttribute('font-family', 'OpenDyslexic, Arial, Verdana, sans-serif');
        document.body.appendChild(temp);
        let fits = false;
        while (!fits && fontSize >= minFontSize) {
            if (words.length > 1) {
                lines = words.slice();
            } else {
                lines = [this.label];
            }
            temp.setAttribute('font-size', fontSize + 'em');
            let maxLineWidth = 0;
            for (let line of lines) {
                temp.textContent = line;
                maxLineWidth = Math.max(maxLineWidth, temp.getBBox().width);
            }
            if (maxLineWidth <= maxWidth && lines.length * fontSize * 16 <= this.r * 2 * 0.9) {
                fits = true;
            } else {
                fontSize -= 0.04;
            }
        }
        if (!fits && lines.length > 0) {
            let last = lines[lines.length - 1];
            let cut = last;
            let added = false;
            for (let i = last.length - 1; i > 0; i--) {
                temp.textContent = last.slice(0, i) + '...';
                if (temp.getBBox().width <= maxWidth) {
                    cut = last.slice(0, i) + '...';
                    added = true;
                    break;
                }
            }
            if (added) lines[lines.length - 1] = cut;
        }
        document.body.removeChild(temp);

        svgGroup.appendChild(g);

        // Thêm sự kiện click để hiển thị label node (dyslexia-friendly, tối ưu hơn)
        g.addEventListener('click', e => {
            const labelDiv = document.getElementById('selected-node-label');
            if (labelDiv) {
                // Tối ưu cho dyslexia: tách từ thành âm tiết (nếu có), mỗi âm tiết/từ một màu pastel dịu xen kẽ, chữ cái đầu in đậm
                const pastelColors = [
                    '#b39ddb', '#90caf9', '#a5d6a7', '#ffe082', '#ffab91', '#bcaaa4', '#f48fb1', '#80cbc4'
                ];
                const words = this.label.split(' ');
                const lines = words.map((word, wi) => {
                    if (!word) return '';
                    // Tách âm tiết nếu có dấu gạch nối hoặc dấu cách (ví dụ: multi-syllable)
                    let syllables = word.split(/[-_]/g);
                    if (syllables.length === 1) syllables = [word];
                    return syllables.map((syll, si) => {
                        let chars = syll.split('');
                        chars[0] = `<b>${chars[0]}</b>`;
                        // Mỗi âm tiết/từ một màu
                        return `<span style="color:${pastelColors[(wi+si)%pastelColors.length]}">${chars.join(' ')}</span>`;
                    }).join(' - ');
                });
                labelDiv.innerHTML = lines.join('<br>');
                labelDiv.style.textAlign = 'center';
                labelDiv.style.fontSize = '1.5em';
                labelDiv.style.letterSpacing = '0.25em';
                labelDiv.style.wordBreak = 'break-all';
            }
        });

        return g;
    }

    _drawText(g, fontSize, lines, animateText = false) {
        lines.forEach((line, idx) => {
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute('x', this.x);
            text.setAttribute('y', this.y + (idx - (lines.length - 1) / 2) * (fontSize * 18));
            text.setAttribute('font-size', fontSize + 'em');
            text.setAttribute('font-family', 'OpenDyslexic, Arial, Verdana, sans-serif');
            text.setAttribute('letter-spacing', '0.12em');
            text.textContent = line;
            if (animateText) {
                text.style.opacity = 0;
                setTimeout(() => {
                    text.style.transition = 'opacity 0.5s';
                    text.style.opacity = 1;
                }, 10 + idx * 80);
            }
            g.appendChild(text);
        });
    }
} 