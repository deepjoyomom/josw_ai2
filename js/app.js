/**
 * App - 데이터 분석 대시보드 메인 컨트롤러
 * 클라이언트 메모리 내 데이터 파싱 및 실시간 통계 분석 연동
 */
document.addEventListener('DOMContentLoaded', () => {
  // 상태 관리
  const state = {
    rawData: [],          // 파싱된 원본 레코드 배열 [ {col1: val, ...}, ... ]
    columns: [],          // 전체 컬럼명
    numericCols: [],      // 수치형 컬럼명 목록
    categoricalCols: [],  // 범주형 컬럼명 목록
    dateCols: [],         // 날짜/시간형 컬럼명 목록
    selectedSheet: '',
    sheets: {},           // 시트별 원시 데이터
    currentTab: 'overview',
    theme: 'dark'
  };

  // DOM 요소 캐싱
  const elements = {
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    fileInput: document.getElementById('fileInput'),
    uploadZone: document.getElementById('uploadZone'),
    loadDefaultBtn: document.getElementById('loadDefaultBtn'),
    datasetStatusText: document.getElementById('datasetStatusText'),
    statusDot: document.getElementById('statusDot'),
    summaryTotalRows: document.getElementById('summaryTotalRows'),
    summaryTotalCols: document.getElementById('summaryTotalCols'),
    summaryNumericCols: document.getElementById('summaryNumericCols'),
    summaryMissingValues: document.getElementById('summaryMissingValues'),
    sheetSelect: document.getElementById('sheetSelect'),
    oneClickAllBtn: document.getElementById('oneClickAllBtn'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    
    // 탭 버튼 및 패널
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),

    // 1. 개요 & 기술통계
    descVarSelect: document.getElementById('descVarSelect'),
    descKpiGrid: document.getElementById('descKpiGrid'),
    descInsightText: document.getElementById('descInsightText'),
    dataPreviewTableHead: document.getElementById('dataPreviewTableHead'),
    dataPreviewTableBody: document.getElementById('dataPreviewTableBody'),

    // 2. 공정관리도 & 이상치
    spcVarSelect: document.getElementById('spcVarSelect'),
    spcSigmaSelect: document.getElementById('spcSigmaSelect'),
    spcKpiGrid: document.getElementById('spcKpiGrid'),
    spcInsightText: document.getElementById('spcInsightText'),
    outlierTableBody: document.getElementById('outlierTableBody'),

    // 3. 상관관계 & 회귀분석
    corrHeatmapContainer: document.getElementById('corrHeatmapContainer'),
    regXVarSelect: document.getElementById('regXVarSelect'),
    regYVarSelect: document.getElementById('regYVarSelect'),
    regKpiGrid: document.getElementById('regKpiGrid'),
    regInsightText: document.getElementById('regInsightText'),

    // 4. 가설검정 & 그룹비교
    testGroupVarSelect: document.getElementById('testGroupVarSelect'),
    testMetricVarSelect: document.getElementById('testMetricVarSelect'),
    testKpiGrid: document.getElementById('testKpiGrid'),
    testInsightText: document.getElementById('testInsightText'),
    testResultTable: document.getElementById('testResultTable'),

    // 5. 시계열 & 이동평균
    tsVarSelect: document.getElementById('tsVarSelect'),
    tsWindowSelect: document.getElementById('tsWindowSelect'),
    tsInsightText: document.getElementById('tsInsightText')
  };

  // Lucide Icons 초기화
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // --- 이벤트 리스너 바인딩 ---
  initEventListeners();

  function initEventListeners() {
    // 테마 토글
    elements.themeToggleBtn.addEventListener('click', toggleTheme);

    // 파일 업로드 이벤트
    elements.uploadZone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileInput);
    
    // 드래그 앤 드롭
    elements.uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      elements.uploadZone.classList.add('dragover');
    });
    elements.uploadZone.addEventListener('dragleave', () => {
      elements.uploadZone.classList.remove('dragover');
    });
    elements.uploadZone.addEventListener('drop', handleFileDrop);

    // 기본 엑셀 데이터 로드 버튼
    elements.loadDefaultBtn.addEventListener('click', loadDefaultExcelData);

    // 원클릭 종합 진단 버튼
    elements.oneClickAllBtn.addEventListener('click', runOneClickFullDiagnosis);

    // 데이터 내보내기 버튼
    elements.exportCsvBtn.addEventListener('click', exportStatsCsv);
    elements.exportJsonBtn.addEventListener('click', exportStatsJson);

    // 시트 선택 변경
    elements.sheetSelect.addEventListener('change', (e) => {
      loadSheetData(e.target.value);
    });

    // 탭 전환
    elements.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });

    // 탭 1: 기술통계 변수 변경
    elements.descVarSelect.addEventListener('change', () => renderDescriptiveTab());

    // 탭 2: 공정관리도 변수 및 시그마 변경
    elements.spcVarSelect.addEventListener('change', () => renderControlChartTab());
    elements.spcSigmaSelect.addEventListener('change', () => renderControlChartTab());

    // 탭 3: 회귀분석 변수 변경
    elements.regXVarSelect.addEventListener('change', () => renderRegressionTab());
    elements.regYVarSelect.addEventListener('change', () => renderRegressionTab());

    // 탭 4: 가설검정 변수 변경
    elements.testGroupVarSelect.addEventListener('change', () => renderHypothesisTab());
    elements.testMetricVarSelect.addEventListener('change', () => renderHypothesisTab());

    // 탭 5: 시계열 변수 변경
    elements.tsVarSelect.addEventListener('change', () => renderTimeSeriesTab());
    elements.tsWindowSelect.addEventListener('change', () => renderTimeSeriesTab());
  }

  // --- 테마 전환 ---
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    ChartManager.setTheme(state.theme);

    const icon = elements.themeToggleBtn.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', state.theme === 'dark' ? 'moon' : 'sun');
      if (window.lucide) window.lucide.createIcons();
    }

    // 현재 탭 실시간 재렌더링 (차트 색상 테마 동기화)
    refreshCurrentTab();
  }

  // --- 탭 전환 로직 ---
  function switchTab(tabId) {
    state.currentTab = tabId;
    elements.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    elements.tabPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === `${tabId}Pane`);
    });

    refreshCurrentTab();
  }

  function refreshCurrentTab() {
    if (state.rawData.length === 0) return;

    switch (state.currentTab) {
      case 'overview':
        renderDescriptiveTab();
        break;
      case 'spc':
        renderControlChartTab();
        break;
      case 'correlation':
        renderCorrelationTab();
        break;
      case 'hypothesis':
        renderHypothesisTab();
        break;
      case 'timeseries':
        renderTimeSeriesTab();
        break;
    }
  }

  // --- 엑셀 파일 로딩 (SheetJS / FileReader) ---
  function handleFileInput(e) {
    const file = e.target.files[0];
    if (file) parseExcelFile(file);
  }

  function handleFileDrop(e) {
    e.preventDefault();
    elements.uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) parseExcelFile(file);
  }

  // 기본 엑셀 데이터셋 로드 (sensor_data_dummy.xlsx 시도 -> fetch 불가시 데모 생성)
  async function loadDefaultExcelData() {
    showToast('sensor_data_dummy.xlsx 불러오는 중...');
    try {
      const response = await fetch('./sensor_data_dummy.xlsx');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      processWorkbookBuffer(arrayBuffer, 'sensor_data_dummy.xlsx');
    } catch (err) {
      console.warn('로컬 파일 직접 fetch 실패 (CORS/file:// 프로토콜 등). 내장 고정밀 센서 시뮬레이션 데이터를 로드합니다.', err);
      loadSimulatedSensorData();
    }
  }

  // 파일 객체 파싱 (100% 클라이언트 메모리 처리)
  function parseExcelFile(file) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      showToast('❌ 엑셀(.xlsx, .xls) 또는 .csv 파일만 지원합니다.');
      return;
    }

    showToast(`${file.name} 분석 중...`);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        processWorkbookBuffer(data, file.name);
      } catch (error) {
        console.error('엑셀 파싱 오류:', error);
        showToast('❌ 엑셀 파싱 중 오류가 발생했습니다.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function processWorkbookBuffer(buffer, fileName) {
    if (typeof XLSX === 'undefined') {
      showToast('❌ SheetJS 라이브러리를 불러오지 못했습니다.');
      return;
    }

    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    state.sheets = {};

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: null });
      state.sheets[sheetName] = json;
    });

    // 시트 선택기 업데이트
    elements.sheetSelect.innerHTML = '';
    workbook.SheetNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      elements.sheetSelect.appendChild(opt);
    });

    state.selectedSheet = workbook.SheetNames[0];
    elements.datasetStatusText.textContent = `${fileName} (${workbook.SheetNames.length}개 시트)`;
    elements.statusDot.classList.add('active');

    loadSheetData(state.selectedSheet);
    showToast(`✅ ${fileName} 로드 완료!`);
  }

  // 로컬 fetch 차단 시 폴백 센서 데이터셋 생성
  function loadSimulatedSensorData() {
    const records = [];
    const baseTime = new Date('2026-09-21T09:00:00');
    const sensors = ['Sensor_A', 'Sensor_B', 'Sensor_C'];

    for (let i = 0; i < 100; i++) {
      const timeStr = new Date(baseTime.getTime() + i * 60000).toLocaleTimeString();
      const sensor = sensors[i % sensors.length];
      
      // 기저 수치 + 노이즈 + 간헐적 이상치(Outlier) 주입
      let temp = 45.0 + Math.sin(i / 8) * 3.5 + (Math.random() - 0.5) * 2;
      let humidity = 55.0 + Math.cos(i / 10) * 8.0 + (Math.random() - 0.5) * 3;
      let pressure = 101.3 + (Math.random() - 0.5) * 1.5;
      let vibration = 0.4 + Math.abs(Math.sin(i / 5)) * 0.5 + (Math.random() * 0.1);
      
      // 인위적 이상치 (이상치 탐지 검증용)
      if (i === 23 || i === 71) {
        temp += 12.5; // 고온 이상
      }
      if (i === 45) {
        vibration += 1.8; // 진동 충격 이상
      }

      const status = (temp > 52 || vibration > 1.2) ? '경고' : '정상';

      records.push({
        '순번': i + 1,
        '측정시각': timeStr,
        '센서그룹': sensor,
        '온도(℃)': parseFloat(temp.toFixed(2)),
        '습도(%)': parseFloat(humidity.toFixed(2)),
        '기압(kPa)': parseFloat(pressure.toFixed(2)),
        '진동(g)': parseFloat(vibration.toFixed(3)),
        '상태': status
      });
    }

    state.sheets = { 'Sensor_Simulated': records };
    elements.sheetSelect.innerHTML = '<option value="Sensor_Simulated">Sensor_Simulated (내장 데이터)</option>';
    state.selectedSheet = 'Sensor_Simulated';
    elements.datasetStatusText.textContent = 'sensor_data_dummy (시뮬레이션 로드됨)';
    elements.statusDot.classList.add('active');

    loadSheetData(state.selectedSheet);
    showToast('✅ 센서 시뮬레이션 데이터셋이 로드되었습니다.');
  }

  // 선택된 시트의 데이터 처리 및 컬럼 타입 감지
  function loadSheetData(sheetName) {
    state.rawData = state.sheets[sheetName] || [];
    if (state.rawData.length === 0) {
      showToast('선택한 시트에 데이터가 없습니다.');
      return;
    }

    // 컬럼 추출
    const colSet = new Set();
    state.rawData.forEach(row => {
      Object.keys(row).forEach(k => colSet.add(k));
    });
    state.columns = Array.from(colSet);

    // 컬럼 타입 자동 감지
    state.numericCols = [];
    state.categoricalCols = [];
    state.dateCols = [];

    state.columns.forEach(col => {
      let numCount = 0;
      let totalValid = 0;

      state.rawData.forEach(row => {
        const val = row[col];
        if (val !== null && val !== undefined && val !== '') {
          totalValid++;
          if (typeof val === 'number' || (!isNaN(parseFloat(val)) && isFinite(val))) {
            numCount++;
          }
        }
      });

      const ratio = totalValid > 0 ? numCount / totalValid : 0;
      if (ratio >= 0.8 && totalValid > 0) {
        state.numericCols.push(col);
      } else {
        state.categoricalCols.push(col);
      }
    });

    // 요약 스트립 갱신
    elements.summaryTotalRows.textContent = `${state.rawData.length} 행`;
    elements.summaryTotalCols.textContent = `${state.columns.length} 열`;
    elements.summaryNumericCols.textContent = `${state.numericCols.length} 개`;

    let missingCount = 0;
    state.rawData.forEach(r => {
      state.columns.forEach(c => {
        if (r[c] === null || r[c] === undefined || r[c] === '') missingCount++;
      });
    });
    elements.summaryMissingValues.textContent = `${missingCount} 건`;

    // 변수 선택 드롭다운 갱신
    updateDropdownOptions();

    // 데이터 미리보기 테이블 렌더링
    renderDataPreviewTable();

    // 현재 탭 렌더링
    refreshCurrentTab();
  }

  // 드롭다운 옵션 갱신
  function updateDropdownOptions() {
    const numOpts = state.numericCols.map(c => `<option value="${c}">${c}</option>`).join('');
    const allOpts = state.columns.map(c => `<option value="${c}">${c}</option>`).join('');

    elements.descVarSelect.innerHTML = numOpts;
    elements.spcVarSelect.innerHTML = numOpts;
    elements.tsVarSelect.innerHTML = numOpts;

    // 회귀분석 X, Y
    elements.regXVarSelect.innerHTML = numOpts;
    elements.regYVarSelect.innerHTML = numOpts;
    if (state.numericCols.length >= 2) {
      elements.regYVarSelect.selectedIndex = 1;
    }

    // 가설검정 그룹 & 수치
    elements.testGroupVarSelect.innerHTML = state.categoricalCols.length > 0 
      ? state.categoricalCols.map(c => `<option value="${c}">${c}</option>`).join('')
      : allOpts;
    elements.testMetricVarSelect.innerHTML = numOpts;
  }

  // 데이터 미리보기 테이블
  function renderDataPreviewTable() {
    const displayRows = state.rawData.slice(0, 10);
    
    // Thead
    elements.dataPreviewTableHead.innerHTML = `<tr>
      ${state.columns.map(c => `<th>${c}</th>`).join('')}
    </tr>`;

    // Tbody
    elements.dataPreviewTableBody.innerHTML = displayRows.map(row => `
      <tr>
        ${state.columns.map(c => `<td>${row[c] !== null && row[c] !== undefined ? row[c] : '<span class="text-subtle">null</span>'}</td>`).join('')}
      </tr>
    `).join('');
  }

  // =========================================================================
  // 1. 종합 개요 & 기술통계 탭 렌더링
  // =========================================================================
  function renderDescriptiveTab() {
    const varName = elements.descVarSelect.value;
    if (!varName) return;

    const values = state.rawData.map(r => r[varName]);
    const summary = StatsEngine.summarize(values);

    // KPI 카드 렌더링
    elements.descKpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-title">표본 크기 (N)</div>
        <div class="kpi-value">${summary.count}</div>
        <div class="kpi-desc">결측치: ${summary.missing}건</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">산술 평균 (Mean)</div>
        <div class="kpi-value">${summary.mean.toFixed(2)}</div>
        <div class="kpi-desc">중앙값: ${summary.median.toFixed(2)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">표준 편차 (Std Dev)</div>
        <div class="kpi-value">${summary.stdev.toFixed(2)}</div>
        <div class="kpi-desc">분산: ${summary.variance.toFixed(2)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">변동 계수 (CV)</div>
        <div class="kpi-value">${summary.cv.toFixed(1)}%</div>
        <div class="kpi-desc">상대적 산포도</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">사분위 범위 (IQR)</div>
        <div class="kpi-value">${summary.iqr.toFixed(2)}</div>
        <div class="kpi-desc">Q1: ${summary.q1.toFixed(2)} / Q3: ${summary.q3.toFixed(2)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">왜도 (Skewness)</div>
        <div class="kpi-value">${summary.skewness.toFixed(3)}</div>
        <div class="kpi-desc">${getSkewnessInterpretation(summary.skewness)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">첨도 (Kurtosis)</div>
        <div class="kpi-value">${summary.kurtosis.toFixed(3)}</div>
        <div class="kpi-desc">${getKurtosisInterpretation(summary.kurtosis)}</div>
      </div>
    `;

    // 히스토그램 + 정규분포 차트
    const histData = StatsEngine.histogram(values, 12);
    ChartManager.renderHistogram('descHistogramChart', histData, varName);

    // 자연어 인사이트 생성
    let insight = `<strong>[${varName}]</strong>의 평균은 <strong>${summary.mean.toFixed(2)}</strong>, 중앙값은 <strong>${summary.median.toFixed(2)}</strong>입니다. `;
    if (Math.abs(summary.skewness) < 0.5) {
      insight += `왜도가 ${summary.skewness.toFixed(2)}로 정규분포에 가까운 대칭 분포를 띠고 있습니다. `;
    } else if (summary.skewness > 0.5) {
      insight += `왜도가 ${summary.skewness.toFixed(2)}로 오른쪽으로 긴 꼬리를 가진 양의 비대칭 분포입니다. `;
    } else {
      insight += `왜도가 ${summary.skewness.toFixed(2)}로 왼쪽으로 긴 꼬리를 가진 음의 비대칭 분포입니다. `;
    }
    insight += `데이터의 변동폭(Min ~ Max)은 ${summary.min.toFixed(2)} ~ ${summary.max.toFixed(2)} (범위: ${summary.range.toFixed(2)})이며, 표준편차는 ${summary.stdev.toFixed(2)}입니다.`;
    elements.descInsightText.innerHTML = insight;
  }

  function getSkewnessInterpretation(skew) {
    if (Math.abs(skew) < 0.5) return '거의 완벽한 대칭';
    if (skew > 0.5) return '오른쪽 치우침 (양의 왜도)';
    return '왼쪽 치우침 (음의 왜도)';
  }

  function getKurtosisInterpretation(kurt) {
    if (Math.abs(kurt) < 0.5) return '정규분포 수준 첨도';
    if (kurt > 0.5) return '뾰족한 꼬리 (급첨)';
    return '완만한 꼬리 (완첨)';
  }

  // =========================================================================
  // 2. 공정관리도 & 이상치 탐지 탭 렌더링
  // =========================================================================
  function renderControlChartTab() {
    const varName = elements.spcVarSelect.value;
    const sigma = parseFloat(elements.spcSigmaSelect.value) || 3;
    if (!varName) return;

    const values = state.rawData.map(r => r[varName]);
    const cc = StatsEngine.controlChart(values, sigma);
    const outlierInfo = StatsEngine.detectOutliers(values);

    // KPI 카드
    elements.spcKpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-title">공정 중심선 (CL)</div>
        <div class="kpi-value">${cc.cl.toFixed(2)}</div>
        <div class="kpi-desc">전체 평균 기준</div>
      </div>
      <div class="kpi-card warning">
        <div class="kpi-title">관리 상한선 (UCL)</div>
        <div class="kpi-value">${cc.ucl.toFixed(2)}</div>
        <div class="kpi-desc">+${sigma}σ 임계점</div>
      </div>
      <div class="kpi-card warning">
        <div class="kpi-title">관리 하한선 (LCL)</div>
        <div class="kpi-value">${cc.lcl.toFixed(2)}</div>
        <div class="kpi-desc">-${sigma}σ 임계점</div>
      </div>
      <div class="kpi-card ${cc.anomalyCount > 0 ? 'accent' : 'success'}">
        <div class="kpi-title">공정 이탈 이상치</div>
        <div class="kpi-value">${cc.anomalyCount}건</div>
        <div class="kpi-desc">이탈률: ${cc.anomalyRate}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">IQR 기준 이상치</div>
        <div class="kpi-value">${outlierInfo.iqrOutlierCount}건</div>
        <div class="kpi-desc">1.5 × IQR 울타리 밖</div>
      </div>
    `;

    // 관리도 차트
    ChartManager.renderControlChart('spcControlChart', cc, varName);

    // 이상치 목록 테이블 갱신
    if (cc.anomalies.length === 0) {
      elements.outlierTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">✅ ${sigma}σ 관리한계 내에서 관리되고 있습니다. 이탈 이상치가 없습니다.</td></tr>`;
    } else {
      elements.outlierTableBody.innerHTML = cc.anomalies.map(a => `
        <tr>
          <td>#${a.index}</td>
          <td><strong>${a.value.toFixed(2)}</strong></td>
          <td><span class="badge badge-accent">${a.type}</span></td>
          <td>${a.deviation.toFixed(2)}σ 편차</td>
        </tr>
      `).join('');
    }

    // 자연어 인사이트
    let insight = `<strong>[공정 품질 진단]</strong> 총 ${cc.points.length}개의 데이터 포인트 중 `;
    if (cc.anomalyCount === 0) {
      insight += `관리한계(±${sigma}σ)를 이탈한 포인트가 없어 공정이 <strong>매우 안정적인 관리 상태(In-Control)</strong>를 유지하고 있습니다.`;
    } else {
      insight += `<strong class="text-accent">${cc.anomalyCount}건(${cc.anomalyRate}%)</strong>의 포인트가 관리 한계를 초과하여 <strong>공정 이상(Out-of-Control)</strong> 징후가 포착되었습니다. 특히 표에 명시된 샘플의 원인 조사가 필요합니다.`;
    }
    elements.spcInsightText.innerHTML = insight;
  }

  // =========================================================================
  // 3. 상관관계 & 회귀분석 탭 렌더링
  // =========================================================================
  function renderCorrelationTab() {
    renderCorrelationMatrix();
    renderRegressionTab();
  }

  function renderCorrelationMatrix() {
    if (state.numericCols.length === 0) return;

    const colsData = {};
    state.numericCols.forEach(col => {
      colsData[col] = state.rawData.map(r => r[col]);
    });

    const matrixData = StatsEngine.correlationMatrix(colsData, state.numericCols);
    ChartManager.renderCorrelationHeatmap('corrHeatmapContainer', matrixData);
  }

  function renderRegressionTab() {
    const xName = elements.regXVarSelect.value;
    const yName = elements.regYVarSelect.value;
    if (!xName || !yName) return;

    const xVals = state.rawData.map(r => r[xName]);
    const yVals = state.rawData.map(r => r[yName]);

    const reg = StatsEngine.linearRegression(xVals, yVals);

    // KPI 카드
    const sign = reg.intercept >= 0 ? '+' : '-';
    const regEquation = `Y = ${reg.slope.toFixed(3)}X ${sign} ${Math.abs(reg.intercept).toFixed(3)}`;

    elements.regKpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-title">선형 회귀식</div>
        <div class="kpi-value" style="font-size: 1.05rem;">${regEquation}</div>
        <div class="kpi-desc">기울기: ${reg.slope.toFixed(4)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">결정계수 (R²)</div>
        <div class="kpi-value">${(reg.r2 * 100).toFixed(1)}%</div>
        <div class="kpi-desc">설명력 (R² = ${reg.r2.toFixed(3)})</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">피어슨 상관계수 (r)</div>
        <div class="kpi-value">${reg.r.toFixed(3)}</div>
        <div class="kpi-desc">${getCorrelationStrength(reg.r)}</div>
      </div>
      <div class="kpi-card ${reg.pValue < 0.05 ? 'success' : 'warning'}">
        <div class="kpi-title">회귀 유의확률 (p-value)</div>
        <div class="kpi-value">${reg.pValue < 0.001 ? '< 0.001' : reg.pValue.toFixed(4)}</div>
        <div class="kpi-desc">${reg.pValue < 0.05 ? '통계적으로 매우 유의함' : '유의하지 않음'}</div>
      </div>
    `;

    // 산점도 및 회귀 추세선 차트
    ChartManager.renderScatterRegression('regScatterChart', reg, xName, yName);

    // 자연어 인사이트
    let insight = `<strong>[${xName} → ${yName}]</strong> 간의 피어슨 상관계수는 <strong>${reg.r.toFixed(3)}</strong>로 <strong>${getCorrelationStrength(reg.r)}</strong>을 보입니다. `;
    insight += `회귀 모델의 결정계수(R²)는 <strong>${(reg.r2 * 100).toFixed(1)}%</strong>로, ${xName}의 변화로 ${yName}의 변동을 약 ${Math.round(reg.r2 * 100)}% 설명할 수 있습니다. `;
    insight += reg.pValue < 0.05 
      ? `(p < 0.05로 두 변수 간의 선형 관계는 통계적으로 유의합니다.)` 
      : `(p ≥ 0.05로 두 변수 간의 통계적 유의성이 부족합니다.)`;
    elements.regInsightText.innerHTML = insight;
  }

  function getCorrelationStrength(r) {
    const abs = Math.abs(r);
    const dir = r >= 0 ? '양의 상관' : '음의 상관';
    if (abs >= 0.7) return `강한 ${dir}`;
    if (abs >= 0.4) return `뚜렷한 ${dir}`;
    if (abs >= 0.2) return `약한 ${dir}`;
    return '상관관계 거의 없음';
  }

  // =========================================================================
  // 4. 가설검정 & 그룹비교 탭 렌더링
  // =========================================================================
  function renderHypothesisTab() {
    const groupCol = elements.testGroupVarSelect.value;
    const metricCol = elements.testMetricVarSelect.value;
    if (!groupCol || !metricCol) return;

    // 그룹별 데이터 분할
    const groups = {};
    state.rawData.forEach(row => {
      const gKey = String(row[groupCol] || '미분류');
      const val = row[metricCol];
      if (!groups[gKey]) groups[gKey] = [];
      if (val !== null && val !== undefined) groups[gKey].push(val);
    });

    const groupKeys = Object.keys(groups).filter(k => groups[k].length > 1);
    if (groupKeys.length < 2) {
      elements.testInsightText.innerHTML = '비교할 그룹 수가 2개 이상이어야 가설 검정을 수행할 수 있습니다.';
      return;
    }

    if (groupKeys.length === 2) {
      // 2개 그룹: 독립표본 t-검정
      const g1 = groups[groupKeys[0]];
      const g2 = groups[groupKeys[1]];
      const tResult = StatsEngine.twoSampleTTest(g1, g2);

      elements.testKpiGrid.innerHTML = `
        <div class="kpi-card">
          <div class="kpi-title">검정 기법</div>
          <div class="kpi-value" style="font-size: 1.1rem;">독립표본 t-검정</div>
          <div class="kpi-desc">2개 집단 평균비교</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">t 통계량</div>
          <div class="kpi-value">${tResult.tStat.toFixed(3)}</div>
          <div class="kpi-desc">자유도(df): ${tResult.df.toFixed(1)}</div>
        </div>
        <div class="kpi-card ${tResult.pValue < 0.05 ? 'success' : 'warning'}">
          <div class="kpi-title">유의확률 (p-value)</div>
          <div class="kpi-value">${tResult.pValue < 0.001 ? '< 0.001' : tResult.pValue.toFixed(4)}</div>
          <div class="kpi-desc">${tResult.pValue < 0.05 ? '유의수준 5%에서 기각(차이 있음)' : '유의수준 5%에서 채택(차이 없음)'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">집단 간 평균 차이</div>
          <div class="kpi-value">${tResult.diff.toFixed(2)}</div>
          <div class="kpi-desc">${groupKeys[0]}(${tResult.mean1.toFixed(2)}) vs ${groupKeys[1]}(${tResult.mean2.toFixed(2)})</div>
        </div>
      `;

      // 집단별 평균 차트
      const anovaMock = {
        groupStats: [
          { name: groupKeys[0], mean: tResult.mean1, stdev: tResult.sd1, n: tResult.n1 },
          { name: groupKeys[1], mean: tResult.mean2, stdev: tResult.sd2, n: tResult.n2 }
        ]
      };
      ChartManager.renderGroupComparison('hypothesisBarChart', anovaMock, metricCol);

      // 인사이트 문장
      elements.testInsightText.innerHTML = `<strong>[독립표본 t-검정 결과]</strong> ${groupKeys[0]} 집단(평균: ${tResult.mean1.toFixed(2)})과 ${groupKeys[1]} 집단(평균: ${tResult.mean2.toFixed(2)})의 차이를 검정한 결과, p-value는 <strong>${tResult.pValue < 0.001 ? '< 0.001' : tResult.pValue.toFixed(4)}</strong>입니다. ` +
        (tResult.isSignificant 
          ? `<strong class="text-success">두 집단 간의 ${metricCol} 평균 차이는 통계적으로 유의미합니다.</strong> (p < 0.05)`
          : `두 집단 간의 ${metricCol} 평균 차이는 단순 우연에 의한 것으로 보이며, <strong>통계적으로 유의하지 않습니다.</strong> (p ≥ 0.05)`);

    } else {
      // 3개 이상 그룹: 일원배치 분산분석 (One-Way ANOVA)
      const anova = StatsEngine.oneWayAnova(groups);
      if (!anova) return;

      elements.testKpiGrid.innerHTML = `
        <div class="kpi-card">
          <div class="kpi-title">검정 기법</div>
          <div class="kpi-value" style="font-size: 1.1rem;">일원분산분석 (ANOVA)</div>
          <div class="kpi-desc">${anova.k}개 집단 분산비교</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">F 통계량</div>
          <div class="kpi-value">${anova.fStat.toFixed(3)}</div>
          <div class="kpi-desc">df: (${anova.dfBetween}, ${anova.dfWithin})</div>
        </div>
        <div class="kpi-card ${anova.pValue < 0.05 ? 'success' : 'warning'}">
          <div class="kpi-title">유의확률 (p-value)</div>
          <div class="kpi-value">${anova.pValue < 0.001 ? '< 0.001' : anova.pValue.toFixed(4)}</div>
          <div class="kpi-desc">${anova.pValue < 0.05 ? '그룹 간 유의미한 차이 존재' : '그룹 간 차이 유의하지 않음'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">전체 총괄 평균</div>
          <div class="kpi-value">${anova.grandMean.toFixed(2)}</div>
          <div class="kpi-desc">총 표본: ${anova.totalN}개</div>
        </div>
      `;

      // 차트
      ChartManager.renderGroupComparison('hypothesisBarChart', anova, metricCol);

      // 인사이트 문장
      elements.testInsightText.innerHTML = `<strong>[One-Way ANOVA 분산분석 결과]</strong> ${anova.k}개 집단 간 ${metricCol}의 평균 차이를 비교한 결과, F값은 <strong>${anova.fStat.toFixed(3)}</strong>이며 p-value는 <strong>${anova.pValue < 0.001 ? '< 0.001' : anova.pValue.toFixed(4)}</strong>입니다. ` +
        (anova.isSignificant
          ? `<strong class="text-success">최소한 어느 한 그룹의 평균은 다른 그룹과 유의미하게 다릅니다.</strong> (p < 0.05)`
          : `그룹 간 평균 차이는 통계적으로 유의미하지 않습니다. (p ≥ 0.05)`);
    }
  }

  // =========================================================================
  // 5. 시계열 & 이동평균 탭 렌더링
  // =========================================================================
  function renderTimeSeriesTab() {
    const varName = elements.tsVarSelect.value;
    const windowSize = parseInt(elements.tsWindowSelect.value) || 5;
    if (!varName) return;

    const values = state.rawData.map(r => r[varName]);
    const labels = state.rawData.map((r, i) => r['측정시각'] || r['Timestamp'] || r['Date'] || r['순번'] || `#${i + 1}`);

    const sma = StatsEngine.simpleMovingAverage(values, windowSize);
    const ema = StatsEngine.exponentialMovingAverage(values, 2 / (windowSize + 1));

    ChartManager.renderTimeSeries('tsLineChart', labels, { raw: values, sma, ema }, varName);

    elements.tsInsightText.innerHTML = `<strong>[${varName}]</strong>의 단기 노이즈를 필터링하기 위해 <strong>윈도우 ${windowSize}</strong>의 단순이동평균(SMA)과 지수이동평균(EMA)을 실시간 적용했습니다. 급격한 이상 스파이크를 완화하고 센서의 중장기 드리프트(Drift) 추세를 파악할 수 있습니다.`;
  }

  // =========================================================================
  // 원클릭 종합 진단 브리핑 (One-Click Full Diagnosis)
  // =========================================================================
  function runOneClickFullDiagnosis() {
    if (state.numericCols.length === 0) {
      showToast('⚠️ 분석할 수치형 데이터가 없습니다.');
      return;
    }

    showToast('⚡ 원클릭 전체 통계 진단 시작...');

    // 모든 수치형 변수에 대한 자동 종합 스캔
    const scanResults = [];
    state.numericCols.forEach(col => {
      const vals = state.rawData.map(r => r[col]);
      const summary = StatsEngine.summarize(vals);
      const cc = StatsEngine.controlChart(vals, 3);
      scanResults.push({ col, summary, cc });
    });

    // 다변량 상관분석 상위 쌍 찾기
    const colsData = {};
    state.numericCols.forEach(col => {
      colsData[col] = state.rawData.map(r => r[col]);
    });
    const matrixData = StatsEngine.correlationMatrix(colsData, state.numericCols);
    
    let maxCorr = { r: 0, pair: ['', ''] };
    for (let i = 0; i < state.numericCols.length; i++) {
      for (let j = i + 1; j < state.numericCols.length; j++) {
        const rVal = matrixData.matrix[i][j];
        if (Math.abs(rVal) > Math.abs(maxCorr.r)) {
          maxCorr = { r: rVal, pair: [state.numericCols[i], state.numericCols[j]] };
        }
      }
    }

    // 모달 / 알림 형태 브리핑 출력
    const totalAnomalies = scanResults.reduce((acc, cur) => acc + cur.cc.anomalyCount, 0);

    let summaryHtml = `
      <div style="padding: 1rem; line-height: 1.7;">
        <h3 style="color: var(--primary); margin-bottom: 0.75rem;">📋 원클릭 종합 데이터 통계 진단서</h3>
        <p>• <strong>분석 표본수:</strong> 총 ${state.rawData.length} 행, 수치형 변수 ${state.numericCols.length}개</p>
        <p>• <strong>공정 이상치 총합:</strong> 3-시그마 한계 이탈 총 <span class="badge ${totalAnomalies > 0 ? 'badge-accent' : 'badge-success'}">${totalAnomalies}건</span> 감지</p>
        <p>• <strong>최대 상관관계:</strong> [${maxCorr.pair[0]} ↔ ${maxCorr.pair[1]}] (r = ${maxCorr.r.toFixed(3)})</p>
        <hr style="margin: 0.75rem 0; border: 0; border-top: 1px solid var(--border-color);" />
        <p><strong>변수별 상세 요약:</strong></p>
        <ul style="padding-left: 1.2rem; font-size: 0.85rem;">
          ${scanResults.map(s => `
            <li><strong>${s.col}</strong>: 평균 ${s.summary.mean.toFixed(2)}, 표준편차 ${s.summary.stdev.toFixed(2)}, 이상치 ${s.cc.anomalyCount}건 (왜도: ${s.summary.skewness.toFixed(2)})</li>
          `).join('')}
        </ul>
      </div>
    `;

    // 탭 1로 전환하고 인사이트 박스에 브리핑 내용 삽입
    switchTab('overview');
    elements.descInsightText.innerHTML = summaryHtml;
    showToast('✅ 원클릭 종합 진단이 완료되었습니다!');
  }

  // =========================================================================
  // 통계 결과 CSV / JSON 다운로드 (클라이언트 사이드 파일 생성)
  // =========================================================================
  function exportStatsCsv() {
    if (state.numericCols.length === 0) return;

    let csvContent = '변수명,표본수,평균,중앙값,표준편차,최솟값,최댓값,사분위범위(IQR),왜도,첨도,3시그마이상치건수\n';
    state.numericCols.forEach(col => {
      const vals = state.rawData.map(r => r[col]);
      const s = StatsEngine.summarize(vals);
      const cc = StatsEngine.controlChart(vals, 3);
      csvContent += `"${col}",${s.count},${s.mean.toFixed(3)},${s.median.toFixed(3)},${s.stdev.toFixed(3)},${s.min.toFixed(3)},${s.max.toFixed(3)},${s.iqr.toFixed(3)},${s.skewness.toFixed(3)},${s.kurtosis.toFixed(3)},${cc.anomalyCount}\n`;
    });

    downloadBlob(csvContent, '통계분석_요약보고서.csv', 'text/csv;charset=utf-8;');
  }

  function exportStatsJson() {
    if (state.numericCols.length === 0) return;

    const report = {
      timestamp: new Date().toISOString(),
      dataset: elements.datasetStatusText.textContent,
      totalRows: state.rawData.length,
      variables: {}
    };

    state.numericCols.forEach(col => {
      const vals = state.rawData.map(r => r[col]);
      report.variables[col] = {
        summary: StatsEngine.summarize(vals),
        controlChart: StatsEngine.controlChart(vals, 3),
        outliers: StatsEngine.detectOutliers(vals)
      };
    });

    const jsonStr = JSON.stringify(report, null, 2);
    downloadBlob(jsonStr, '통계분석_결과보고서.json', 'application/json');
  }

  function downloadBlob(content, filename, contentType) {
    const blob = new Blob(['\uFEFF' + content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`📥 ${filename} 다운로드 완료!`);
  }

  // 토스트 메시지 헬퍼
  function showToast(msg) {
    const existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // 초기 자동 로딩 시도 (기본 데이터셋)
  setTimeout(() => {
    loadDefaultExcelData();
  }, 300);
});
