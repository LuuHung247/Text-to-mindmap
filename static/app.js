let mindmapData = null;

// Color palette for main branches (border, fill, line)
const branchColors = [
  { border: "#b39ddb", fill: "#ede7f6", line: "#9575cd" }, // tím pastel
  { border: "#90caf9", fill: "#e3f2fd", line: "#64b5f6" }, // xanh dương nhạt
  { border: "#a5d6a7", fill: "#f1f8e9", line: "#66bb6a" }, // xanh lá nhạt
  { border: "#ffe082", fill: "#fffde7", line: "#ffd54f" }, // vàng pastel
  { border: "#ffab91", fill: "#fbe9e7", line: "#ff8a65" }, // cam nhạt
  { border: "#bcaaa4", fill: "#efebe9", line: "#a1887f" }, // nâu nhạt
];

// Central node style
const centralNode = {
  border: "#607d8b",
  fill: "#fffde7",
  text: "#263238"
};

// Node sizes
const SIZES = {
  central: 85,
  branch: 65,
  sub: 52,
};

const svg = document.getElementById("mindmap");
const svgGroup = document.getElementById("mindmap-content");
const tooltip = document.getElementById("tooltip");
let width = window.innerWidth,
  height = window.innerHeight;
let cx = width / 2,
  cy = height / 2;

// For pan/zoom
let panX = 0, panY = 0, zoom = 1, isPanning = false, startX, startY, lastPanX, lastPanY;

// Animation state
let animationSteps = [];
let currentStep = 0;
let isPlaying = false;
let playInterval = null;

// Thêm biến tổng thời gian vẽ mindmap (mặc định 2 phút)
let totalDuration = 120; // giây
let stepDuration = 1; // sẽ tính lại sau

function updateStepDuration() {
    const minStepDuration = 0.1; // giây
    if (animationSteps.length > 1) {
        stepDuration = totalDuration / (animationSteps.length - 1);
        if (stepDuration < minStepDuration) {
            stepDuration = minStepDuration;
            totalDuration = stepDuration * (animationSteps.length - 1);
        }
    } else {
        stepDuration = totalDuration;
    }
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  cx = width / 2;
  cy = height / 2;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  drawMindMap();
}
window.addEventListener("resize", resize);

// --- Layout Calculation ---
function polarToCartesian(angle, radius) {
  return [
    cx + panX + Math.cos(angle) * radius,
    cy + panY + Math.sin(angle) * radius,
  ];
}

// Tạo các bước animation (duyệt theo thứ tự: central -> branch -> sub-branch)
function buildAnimationSteps() {
  animationSteps = [];
  // Bước 0: chỉ hiện central
  animationSteps.push({ central: true, branches: [] });
  if (!mindmapData || !mindmapData.branches) return;
  // Bước 1...: lần lượt hiện từng branch và sub-branch
  let stepBranches = [];
  mindmapData.branches.forEach((branch, i) => {
    // Thêm branch chính
    stepBranches = stepBranches.concat([{ branchIdx: i, subIdx: null }]);
    // Thêm từng sub-branch
    if (Array.isArray(branch.children)) {
      branch.children.forEach((sub, j) => {
        stepBranches = stepBranches.concat([{ branchIdx: i, subIdx: j }]);
      });
    }
  });
  // Mỗi bước là một mảng các branch/sub đã hiện
  for (let k = 1; k <= stepBranches.length; k++) {
    animationSteps.push({
      central: true,
      branches: stepBranches.slice(0, k),
    });
  }
  updateStepDuration();
}

function animateCurve(x1, y1, x2, y2, color, width, onDone) {
  const randomOffset = () => (Math.random() - 0.5) * 30;
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.18 + randomOffset();
  const my = (y1 + y2) / 2 + (x1 - x2) * 0.18 + randomOffset();
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const d = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
  path.setAttribute("d", d);
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", width);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.style.filter = "url(#handdrawn)";
  svgGroup.appendChild(path);
  if (svgGroup.firstChild) {
    svgGroup.insertBefore(path, svgGroup.firstChild);
  }
  const length = path.getTotalLength();
  path.style.strokeDasharray = length;
  path.style.strokeDashoffset = length;
  path.style.transition = "none";
  requestAnimationFrame(() => {
    path.style.transition = "stroke-dashoffset 1.2s cubic-bezier(0.77,0,0.18,1)";
    path.style.strokeDashoffset = 0;
    if (onDone) setTimeout(onDone, 1200);
  });
}

function drawMindMap(step = null) {
  if (isPlaying) return;
  svgGroup.innerHTML = "";
  if (
    !mindmapData ||
    !mindmapData.central_topic ||
    !Array.isArray(mindmapData.branches)
  )
    return;

  const view = getViewTransform();
  const centralPos = getCentralPos();
  const central = {
    x: centralPos.x,
    y: centralPos.y,
    r: SIZES.central,
    label: mindmapData.central_topic,
  };

  // Animation: xác định các branch/sub nào được vẽ ở bước này
  let showBranches = {};
  if (step && step.branches) {
    step.branches.forEach((obj) => {
      if (!showBranches[obj.branchIdx]) showBranches[obj.branchIdx] = {};
      if (obj.subIdx === null) showBranches[obj.branchIdx].main = true;
      else showBranches[obj.branchIdx][obj.subIdx] = true;
    });
  }

  // --- 1. VẼ TOÀN BỘ LINE/CURVE TRƯỚC ---
  const n = mindmapData.branches.length;
  const branchRadius = 273;
  const subRadius = 169;
  const branchAngleStep = (2 * Math.PI) / n;

  mindmapData.branches.forEach((branch, i) => {
    const angle = -Math.PI / 2 + i * branchAngleStep;
    const [bx, by] = [centralPos.x + Math.cos(angle) * branchRadius, centralPos.y + Math.sin(angle) * branchRadius];
    const color = branchColors[i % branchColors.length];

    // Line từ central ra branch
    const branchVisible = !step || (showBranches[i] && showBranches[i].main);
    drawCurveWithFade(
      central.x,
      central.y,
      bx,
      by,
      color.line,
      5,
      branchVisible
    );

    // Sub-branches
    if (Array.isArray(branch.children) && branch.children.length > 0) {
      const m = branch.children.length;
      const subAngleStep = m > 1 ? Math.PI / 4 : 0;
      const baseAngle = angle - ((m - 1) / 2) * subAngleStep;
      branch.children.forEach((sub, j) => {
        const subAngle = baseAngle + j * subAngleStep;
        const sx = bx + Math.cos(subAngle) * subRadius;
        const sy = by + Math.sin(subAngle) * subRadius;
        const subVisible = !step || (showBranches[i] && showBranches[i][j]);
        drawCurveWithFade(bx, by, sx, sy, color.line, 3, subVisible);
      });
    }
  });

  // --- 2. VẼ TOÀN BỘ NODE SAU ---
  mindmapData.branches.forEach((branch, i) => {
    const angle = -Math.PI / 2 + i * branchAngleStep;
    const [bx, by] = [centralPos.x + Math.cos(angle) * branchRadius, centralPos.y + Math.sin(angle) * branchRadius];
    const color = branchColors[i % branchColors.length];

    // Node branch
    const branchVisible = !step || (showBranches[i] && showBranches[i].main);
    drawNodeWithFade(
      bx,
      by,
      SIZES.branch,
      branch.label,
      color.border,
      color.fill,
      false,
      false,
      branchVisible
    );

    // Node sub-branches
    if (Array.isArray(branch.children) && branch.children.length > 0) {
      const m = branch.children.length;
      const subAngleStep = m > 1 ? Math.PI / 4 : 0;
      const baseAngle = angle - ((m - 1) / 2) * subAngleStep;
      branch.children.forEach((sub, j) => {
        const subAngle = baseAngle + j * subAngleStep;
        const sx = bx + Math.cos(subAngle) * subRadius;
        const sy = by + Math.sin(subAngle) * subRadius;
        const subVisible = !step || (showBranches[i] && showBranches[i][j]);
        drawNodeWithFade(
          sx,
          sy,
          SIZES.sub,
          sub.label,
          color.border,
          color.fill,
          false,
          true,
          subVisible
        );
      });
    }
  });

  // Node central luôn hiện
  drawNodeWithFade(
    central.x,
    central.y,
    SIZES.central,
    central.label,
    centralNode.border,
    centralNode.fill,
    true,
    false,
    true
  );

  // Vẽ node
  if (!step || step.central) {
    let nodeElements = [];
    if (step && step.branches) {
      step.branches.forEach((obj) => {
        if (!showBranches[obj.branchIdx]) showBranches[obj.branchIdx] = {};
        const n = mindmapData.branches.length;
        const branchRadius = 273;
        const subRadius = 169;
        const angle = -Math.PI / 2 + obj.branchIdx * ((2 * Math.PI) / n);
        const [bx, by] = [centralPos.x + Math.cos(angle) * branchRadius, centralPos.y + Math.sin(angle) * branchRadius];
        if (obj.subIdx === null) {
          showBranches[obj.branchIdx].main = true;
          nodeElements.push({
            x: bx,
            y: by,
            r: SIZES.branch,
            label: mindmapData.branches[obj.branchIdx].label,
            border: branchColors[obj.branchIdx % branchColors.length].border,
            fill: branchColors[obj.branchIdx % branchColors.length].fill,
            isCentral: false,
            isSub: false,
          });
        } else {
          // Tính vị trí sub-branch
          const branch = mindmapData.branches[obj.branchIdx];
          const m = branch.children.length;
          const subAngleStep = m > 1 ? Math.PI / 4 : 0;
          const baseAngle = angle - ((m - 1) / 2) * subAngleStep;
          const subAngle = baseAngle + obj.subIdx * subAngleStep;
          const sx = bx + Math.cos(subAngle) * subRadius;
          const sy = by + Math.sin(subAngle) * subRadius;
          nodeElements.push({
            x: sx,
            y: sy,
            r: SIZES.sub,
            label: branch.children[obj.subIdx].label,
            border: branchColors[obj.branchIdx % branchColors.length].border,
            fill: branchColors[obj.branchIdx % branchColors.length].fill,
            isCentral: false,
            isSub: true,
          });
        }
      });
    }
    nodeElements.push({
      x: centralPos.x,
      y: centralPos.y,
      r: SIZES.central,
      label: mindmapData.central_topic,
      border: centralNode.border,
      fill: centralNode.fill,
      isCentral: true,
      isSub: false,
    });

    nodeElements.forEach(nodeData => {
      // Tạo instance Node và render với animate=true
      const node = new Node(nodeData.x, nodeData.y, nodeData.r, nodeData.label, nodeData.border, nodeData.fill, nodeData.isCentral, nodeData.isSub, 1);
      node.render(svg, tooltip, true);
    });
    // Central node
    const centralNodeInstance = new Node(central.x, central.y, SIZES.central, central.label, centralNode.border, centralNode.fill, true, false, 1);
    centralNodeInstance.render(svg, tooltip, true);
  }
}

// --- Drawing Functions ---
function drawNodeWithFade(
  x,
  y,
  r,
  label,
  border,
  fill,
  isCentral,
  isSub,
  visible
) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "node" + (isCentral ? " central" : ""));
  g.style.opacity = visible ? 1 : 0;
  g.style.transition = "opacity 0.5s";
  // ...phần còn lại giống drawNode...
  const circle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  circle.setAttribute("cx", x);
  circle.setAttribute("cy", y);
  circle.setAttribute("r", r);
  circle.setAttribute("stroke", border);
  circle.setAttribute(
    "stroke-width",
    isCentral ? 8 : isSub ? 3 : 5
  );
  circle.setAttribute("fill", fill);
  g.appendChild(circle);

  // ...phần label giữ nguyên như drawNode...
  const maxWidth = r * 1.7;
  let fontSize = isCentral ? 0.95 : isSub ? 0.6 : 0.7;
  const minFontSize = 0.28;
  const words = label.split(" ");
  let lines = [];
  const temp = document.createElementNS("http://www.w3.org/2000/svg", "text");
  temp.setAttribute("font-family", "OpenDyslexic, Arial, Verdana, sans-serif");
  document.body.appendChild(temp);
  let fits = false;
  while (!fits && fontSize >= minFontSize) {
    lines = [];
    temp.setAttribute("font-size", fontSize + "em");
    // Nếu có nhiều hơn 1 từ, mỗi dòng 1 từ
    if (words.length > 1) {
      lines = words.slice();
    } else {
      lines = [label];
    }
    let maxLineWidth = 0;
    for (let line of lines) {
      temp.textContent = line;
      maxLineWidth = Math.max(maxLineWidth, temp.getBBox().width);
    }
    if (
      maxLineWidth <= maxWidth &&
      lines.length * fontSize * 16 <= r * 2 * 0.9
    ) {
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
      temp.textContent = last.slice(0, i) + "...";
      if (temp.getBBox().width <= maxWidth) {
        cut = last.slice(0, i) + "...";
        added = true;
        break;
      }
    }
    if (added) lines[lines.length - 1] = cut;
  }
  document.body.removeChild(temp);

  lines.forEach((line, idx) => {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x);
    text.setAttribute(
      "y",
      y + (idx - (lines.length - 1) / 2) * (fontSize * 18)
    );
    text.setAttribute("font-size", fontSize + "em");
    text.setAttribute(
      "font-family",
      "OpenDyslexic, Arial, Verdana, sans-serif"
    );
    text.setAttribute("letter-spacing", "0.12em");
    text.textContent = line;
    g.appendChild(text);
  });

  svgGroup.appendChild(g);
}

function drawLineWithFade(x1, y1, x2, y2, color, width, visible) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", width);
  line.setAttribute("stroke-linecap", "round");
  line.style.opacity = visible ? 1 : 0;
  line.style.transition = "opacity 0.5s";
  svgGroup.appendChild(line);
}

function drawCurveWithFade(x1, y1, x2, y2, color, width, visible) {
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.18;
  const my = (y1 + y2) / 2 + (x1 - x2) * 0.18;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M${x1},${y1} Q${mx},${my} ${x2},${y2}`);
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", width);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-linecap", "round");
  path.style.opacity = visible ? 1 : 0;
  path.style.transition = "opacity 0.5s";
  svgGroup.appendChild(path);
}

// --- Pan/Zoom Interactivity ---
function stopAnimation() {
    isPlaying = false;
}

function updateGroupTransform() {
    svgGroup.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);
}

svg.addEventListener('mousedown', e => {
    if (isPlaying) return;
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    lastPanX = panX;
    lastPanY = panY;
});
svg.addEventListener('mousemove', e => {
    if (isPlaying) return;
    if (isPanning) {
        panX = lastPanX + (e.clientX - startX);
        panY = lastPanY + (e.clientY - startY);
        updateGroupTransform();
    }
});
svg.addEventListener('mouseup', e => {
    if (isPlaying) return;
    if (isPanning) {
        isPanning = false;
    }
});
svg.addEventListener('mouseleave', e => {
    if (isPlaying) return;
    if (isPanning) {
        isPanning = false;
    }
});
svg.addEventListener('wheel', e => {
    if (isPlaying) return;
    e.preventDefault();
    const scale = e.deltaY < 0 ? 1.1 : 0.9;
    zoom *= scale;
    zoom = Math.max(0.4, Math.min(zoom, 2.5));
    updateGroupTransform();
}, { passive: false });

// --- Initial Draw ---
buildAnimationSteps();
resize();

// Animation controls
const animSlider = document.getElementById("anim-slider");
const animStepLabel = document.getElementById("anim-step-label");
const animPlayBtn = document.getElementById("anim-play");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");

function setPlayPauseIcon(isPlaying) {
  if (playIcon && pauseIcon) {
    playIcon.style.display = isPlaying ? "none" : "block";
    pauseIcon.style.display = isPlaying ? "block" : "none";
  }
}

// API cho TTS hoặc điều khiển ngoài
window.showStep = function(index, cb) {
    if (index < 0) index = 0;
    if (index >= animationSteps.length) index = animationSteps.length - 1;
    currentStep = index;
    updateAnimUI(cb);
};

// --- Auto-play theo thời gian ---
let playStartTime = null;
let playStartStep = 0;
let playTimer = null;

function startAutoPlay() {
    if (isAutoPlaying) return;
    isAutoPlaying = true;
    setPlayPauseIcon(true);
    if (currentAudioUrl) {
        if (audioObj) {
            audioObj.pause();
            audioObj.currentTime = stepToTime(currentStep);
        }
        audioObj = new Audio(currentAudioUrl);
        audioObj.currentTime = stepToTime(currentStep);
        audioObj.play();
        setupAudioSync();
        audioObj.onended = function () {
            stopAutoPlay();
        };
    } else {
        // Nếu không có audio, dùng setInterval như cũ
        let startTime = Date.now() - stepToTime(currentStep) * 1000;
    playTimer = setInterval(() => {
            let elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > totalDuration) elapsed = totalDuration;
            setSliderToTime(elapsed);
            const step = timeToStep(elapsed);
        if (step !== currentStep) {
                currentStep = step;
                updateAnimUI();
        }
            if (elapsed >= totalDuration) {
            stopAutoPlay();
        }
        }, 40);
    }
}

function stopAutoPlay() {
    isAutoPlaying = false;
    setPlayPauseIcon(false);
    if (audioObj) {
        audioObj.pause();
    }
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
}

if (animPlayBtn) {
    animPlayBtn.onclick = function () {
        if (!isAutoPlaying) {
            startAutoPlay();
        } else {
            stopAutoPlay();
        }
    };
}

if (animSlider) {
    animSlider.oninput = function () {
        stopAutoPlay();
        const time = parseFloat(animSlider.value);
        const step = timeToStep(time);
        currentStep = step;
        updateAnimUI();
        // Tua audio nếu có
        if (audioObj && !isNaN(audioObj.duration)) {
            audioObj.currentTime = time;
        }
    };
}

function updateAnimUI(cb) {
    if (!animSlider) return;
  const curTime = stepToTime(currentStep);
  animSlider.max = totalDuration;
  animSlider.step = 0.01;
  animSlider.value = curTime;
  // Không cập nhật nhãn thời gian nữa

  // Nếu đang auto-play (animation), chỉ vẽ thêm phần mới, không xóa toàn bộ
    if (
    isAutoPlaying &&
        currentStep > 0 &&
        animationSteps[currentStep] &&
        animationSteps[currentStep].branches.length > 0
    ) {
        const step = animationSteps[currentStep];
        const obj = step.branches[step.branches.length - 1];
        const branch = mindmapData.branches[obj.branchIdx];
        const color = branchColors[obj.branchIdx % branchColors.length];
        const n = mindmapData.branches.length;
        const view = getViewTransform();
        const branchRadius = 273;
        const subRadius = 169;
        const angle = -Math.PI / 2 + obj.branchIdx * ((2 * Math.PI) / n);
        const central = getCentralPos();
        const [bx, by] = [central.x + Math.cos(angle) * branchRadius, central.y + Math.sin(angle) * branchRadius];

    // KHÔNG xóa svgGroup.innerHTML, chỉ vẽ thêm phần mới
        if (obj.subIdx !== null) {
            // Animate sub-branch
            const m = branch.children.length;
            const subAngleStep = m > 1 ? Math.PI / 4 : 0;
            const baseAngle = angle - ((m - 1) / 2) * subAngleStep;
            const subAngle = baseAngle + obj.subIdx * subAngleStep;
            const sx = bx + Math.cos(subAngle) * subRadius;
            const sy = by + Math.sin(subAngle) * subRadius;
            animateCurve(bx, by, sx, sy, color.line, 3, () => {
                animateNodeAppear(sx, sy, SIZES.sub, branch.children[obj.subIdx].label, color.border, color.fill, false, true, () => {
                    if (typeof cb === 'function') cb();
                }, false);
            });
        } else {
            // Animate main branch
            animateCurve(central.x, central.y, bx, by, color.line, 5, () => {
                animateNodeAppear(bx, by, SIZES.branch, branch.label, color.border, color.fill, false, false, () => {
                    if (typeof cb === 'function') cb();
                }, false);
            });
        }
        return;
    }

  // Nếu không auto-play (tua lại, kéo slider), xóa và vẽ lại toàn bộ trạng thái tĩnh
    svgGroup.innerHTML = "";
    drawMindMap(animationSteps[currentStep]);
    if (typeof cb === 'function') cb();
}

// Hiệu ứng node xuất hiện mượt (scale + fade)
function animateNodeAppear(x, y, r, label, border, fill, isCentral, isSub, cb, clear = true) {
    // clear=true: xóa node cũ (dùng khi vẽ lại toàn bộ), clear=false: chỉ thêm node mới
    if (clear === true) {
        // Xóa node cũ nếu cần
        // (mặc định khi vẽ lại toàn bộ)
    }
    const node = new Node(x, y, r, label, border, fill, isCentral, isSub, 1); // đã scale r ở ngoài
    node.render(svg, tooltip, true);
    if (typeof cb === 'function') setTimeout(cb, 800);
}

// Lắng nghe nút cập nhật JSON
const updateBtn = document.getElementById("update-btn");
const jsonInput = document.getElementById("json-input");
const jsonError = document.getElementById("json-error");
const audioPlayBtn = document.getElementById("audio-play");
let currentAudioUrl = null;
let audioObj = null;
let isAutoPlaying = false;

if (audioPlayBtn) {
  audioPlayBtn.disabled = true;
  audioPlayBtn.onclick = function () {
    if (currentAudioUrl) {
      const audio = new Audio(currentAudioUrl);
      audio.play();
    }
  };
}

const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const loadingSpinner = document.getElementById("loading-spinner");

const selectedNodeLabel = document.getElementById("selected-node-label");

if (updateBtn && jsonInput) {
  updateBtn.onclick = async function () {
    if (loadingOverlay) {
      loadingOverlay.style.display = "flex";
      if (loadingText) loadingText.textContent = "Đang tải mindmap...";
      if (loadingSpinner) loadingSpinner.style.display = "block";
    }
    jsonError.textContent = "";
    updateBtn.disabled = true;
    updateBtn.textContent = "Đang tạo...";
    if (animPlayBtn) {
      animPlayBtn.disabled = true;
      currentAudioUrl = null;
      if (audioObj) {
        audioObj.pause();
        audioObj.currentTime = 0;
      }
      isAutoPlaying = false;
    }
    if (selectedNodeLabel) selectedNodeLabel.textContent = "";
    try {
      const inputText = jsonInput.value.trim();
      if (!inputText) {
        jsonError.textContent = "Vui lòng nhập đoạn văn!";
        updateBtn.disabled = false;
        updateBtn.textContent = "Cập nhật Mind Map";
        if (loadingOverlay) loadingOverlay.style.display = "flex";
        if (loadingText) loadingText.textContent = "Nhập văn bản để tạo mindmap";
        if (loadingSpinner) loadingSpinner.style.display = "none";
        return;
      }
      // Gửi request tới Flask API
      const res = await fetch("/process_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText })
      });
      const data = await res.json();
      if (!res.ok || !data.mindmap) {
        jsonError.textContent = data.error || "Lỗi tạo mindmap!";
        updateBtn.disabled = false;
        updateBtn.textContent = "Cập nhật Mind Map";
        if (loadingOverlay) loadingOverlay.style.display = "flex";
        if (loadingText) loadingText.textContent = "Nhập văn bản để tạo mindmap";
        if (loadingSpinner) loadingSpinner.style.display = "none";
        return;
      }
      mindmapData = data.mindmap;
      panX = 0;
      panY = 0;
      zoom = 1;
      // Nếu có audio, lấy duration rồi set totalDuration = duration
      if (data.audio_file) {
        currentAudioUrl = `/audio/${data.audio_file}`;
        const tempAudio = new Audio(currentAudioUrl);
        tempAudio.onloadedmetadata = function () {
          totalDuration = tempAudio.duration;
      buildAnimationSteps();
      currentStep = 0;
          fitMindmapToScreen();
      updateAnimUI();
          animPlayBtn.disabled = false;
          if (loadingOverlay) loadingOverlay.style.display = "none";
        };
        // Đề phòng trường hợp metadata đã sẵn sàng
        if (tempAudio.readyState >= 1) {
          totalDuration = tempAudio.duration;
          buildAnimationSteps();
          currentStep = 0;
          fitMindmapToScreen();
          updateAnimUI();
          animPlayBtn.disabled = false;
          if (loadingOverlay) loadingOverlay.style.display = "none";
        }
      } else {
        currentAudioUrl = null;
        totalDuration = 120;
        buildAnimationSteps();
        currentStep = 0;
        fitMindmapToScreen();
        updateAnimUI();
        animPlayBtn.disabled = true;
        if (loadingOverlay) loadingOverlay.style.display = "none";
      }
      jsonError.textContent = "";
    } catch (e) {
      jsonError.textContent = "Lỗi kết nối server hoặc xử lý!";
      if (loadingOverlay) loadingOverlay.style.display = "flex";
      if (loadingText) loadingText.textContent = "Nhập văn bản để tạo mindmap";
      if (loadingSpinner) loadingSpinner.style.display = "none";
    } finally {
      updateBtn.disabled = false;
      updateBtn.textContent = "Cập nhật Mind Map";
    }
  };
}

// Khi load lần đầu, nếu chưa có mindmapData thì hiện overlay hướng dẫn
if (!mindmapData && loadingOverlay) {
  loadingOverlay.style.display = "flex";
  if (loadingText) loadingText.textContent = "Nhập văn bản để tạo mindmap";
  if (loadingSpinner) loadingSpinner.style.display = "none";
}

// Khi đã có mindmapData thì ẩn overlay
function hideLoadingIfHasMindmap() {
  if (mindmapData && loadingOverlay) {
    loadingOverlay.style.display = "none";
  }
}

// Trong updateAnimUI và các hàm animation, dùng panX, panY, zoom thay cho panX, panY, zoom nếu isPlaying === true
function getViewTransform() {
    return isPlaying ? { panX, panY, zoom } : { panX, panY, zoom };
}

function getCentralPos() {
    return { x: width / 2, y: height / 2 };
}

function fitMindmapToScreen() {
  // Tính toán bounding box của toàn bộ mindmap
  const n = mindmapData.branches.length;
  const branchRadius = 273;
  const subRadius = 169;
  const central = getCentralPos();
  let minX = central.x, maxX = central.x, minY = central.y, maxY = central.y;
  // Duyệt các branch
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + i * ((2 * Math.PI) / n);
    const bx = central.x + Math.cos(angle) * branchRadius;
    const by = central.y + Math.sin(angle) * branchRadius;
    minX = Math.min(minX, bx);
    maxX = Math.max(maxX, bx);
    minY = Math.min(minY, by);
    maxY = Math.max(maxY, by);
    const branch = mindmapData.branches[i];
    if (Array.isArray(branch.children)) {
      const m = branch.children.length;
      const subAngleStep = m > 1 ? Math.PI / 4 : 0;
      const baseAngle = angle - ((m - 1) / 2) * subAngleStep;
      for (let j = 0; j < m; j++) {
        const subAngle = baseAngle + j * subAngleStep;
        const sx = bx + Math.cos(subAngle) * subRadius;
        const sy = by + Math.sin(subAngle) * subRadius;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
    }
  }
  // Tính toán scale và pan để vừa khít khung hình
  const margin = 20;
  const mapWidth = maxX - minX + margin * 2;
  const mapHeight = maxY - minY + margin * 2;
  const scaleX = width / mapWidth;
  const scaleY = height / mapHeight;
  zoom = Math.min(scaleX, scaleY, 1); // zoom vừa khít
  zoom *= 0.85; // zoom out 1 lần
  // Đặt panX, panY để central node ở giữa
  const centerMapX = (minX + maxX) / 2;
  const centerMapY = (minY + maxY) / 2;
  panX = (width / 2 - centerMapX) * zoom;
  panY = (height / 2 - centerMapY) * zoom + 100; // dịch central node xuống thấp hơn
  updateGroupTransform();
}

// Gọi fit-to-screen khi load lần đầu và khi cập nhật dữ liệu
window.addEventListener("load", fitMindmapToScreen);

// --- Đồng bộ slider và audio ---
function setSliderToTime(time) {
  if (!animSlider) return;
  animSlider.value = time;
  // Không cập nhật nhãn thời gian nữa
}

function setSliderMax(duration) {
  if (!animSlider) return;
  animSlider.max = duration;
  animSlider.step = 0.01;
}

function timeToStep(time) {
  if (!totalDuration || animationSteps.length <= 1) return 0;
  let step = Math.round(time / totalDuration * (animationSteps.length - 1));
  step = Math.max(0, Math.min(animationSteps.length - 1, step));
  return step;
}

function stepToTime(step) {
  if (!totalDuration || animationSteps.length <= 1) return 0;
  return step / (animationSteps.length - 1) * totalDuration;
}

// --- Khi kéo slider, tua audio và mindmap ---
if (animSlider) {
  animSlider.oninput = function () {
    stopAutoPlay();
    const time = parseFloat(animSlider.value);
    const step = timeToStep(time);
    currentStep = step;
    updateAnimUI();
    // Tua audio nếu có
    if (audioObj && !isNaN(audioObj.duration)) {
      audioObj.currentTime = time;
    }
  };
}

// --- Khi audio tua, update slider và mindmap ---
function setupAudioSync() {
  if (audioObj) {
    audioObj.ontimeupdate = function () {
      if (!isAutoPlaying) return;
      const time = audioObj.currentTime;
      setSliderToTime(time);
      const step = timeToStep(time);
      if (step !== currentStep) {
        currentStep = step;
        updateAnimUI();
      }
    };
  }
}

function afterMindmapLoaded() {
  if (animSlider) {
    setSliderMax(totalDuration);
    setSliderToTime(0);
  }
}

// Gọi afterMindmapLoaded() sau khi buildAnimationSteps, fitMindmapToScreen, updateAnimUI
afterMindmapLoaded();
 