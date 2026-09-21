/**
 * ChartManager - Chart.js 기반 인터랙티브 시각화 관리자
 * 캔버스 인스턴스 자동 파괴 및 반응형 테마 지원
 */
const ChartManager = (() => {
  // 활성 차트 인스턴스 저장소 (중복 생성 방지)
  const instances = {};

  // 기본 색상 팔레트 (다크/라이트 모드 지원)
  const themes = {
    dark: {
      bg: '#1e293b',
      text: '#94a3b8',
      textMuted: '#64748b',
      grid: '#334155',
      primary: '#38bdf8', // sky-400
      secondary: '#818cf8', // indigo-400
      accent: '#f43f5e', // rose-500
      success: '#34d399', // emerald-400
      warning: '#fbbf24', // amber-400
      ucl: '#f87171',
      cl: '#38bdf8',
      lcl: '#f87171',
      outlier: '#ef4444'
    },
    light: {
      bg: '#ffffff',
      text: '#475569',
      textMuted: '#94a3b8',
      grid: '#e2e8f0',
      primary: '#0284c7', // sky-600
      secondary: '#6366f1', // indigo-500
      accent: '#e11d48', // rose-600
      success: '#059669', // emerald-600
      warning: '#d97706', // amber-600
      ucl: '#dc2626',
      cl: '#0284c7',
      lcl: '#dc2626',
      outlier: '#b91c1c'
    }
  };

  let currentThemeMode = 'dark';

  function setTheme(mode) {
    currentThemeMode = mode;
  }

  function getThemeColors() {
    return themes[currentThemeMode] || themes.dark;
  }

  function destroyChart(canvasId) {
    if (instances[canvasId]) {
      instances[canvasId].destroy();
      delete instances[canvasId];
    }
  }

  function destroyAllCharts() {
    Object.keys(instances).forEach(id => destroyChart(id));
  }

  // 1. 히스토그램 + 정규분포 곡선 차트
  function renderHistogram(canvasId, histData, varName = '값') {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const colors = getThemeColors();

    const config = {
      type: 'bar',
      data: {
        labels: histData.labels,
        datasets: [
          {
            type: 'bar',
            label: `${varName} 도수 (빈도)`,
            data: histData.counts,
            backgroundColor: 'rgba(56, 189, 248, 0.4)',
            borderColor: colors.primary,
            borderWidth: 1.5,
            borderRadius: 4,
            order: 2
          },
          {
            type: 'line',
            label: '정규분포 이론 곡선',
            data: histData.normalCurve,
            borderColor: colors.warning,
            borderWidth: 2.5,
            pointRadius: 0,
            fill: false,
            tension: 0.4,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            labels: { color: colors.text, font: { family: 'Pretendard, sans-serif' } }
          },
          tooltip: {
            backgroundColor: colors.bg,
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: colors.grid,
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { color: colors.grid },
            ticks: { color: colors.text, maxRotation: 45, minRotation: 30 }
          },
          y: {
            grid: { color: colors.grid },
            ticks: { color: colors.text },
            title: { display: true, text: '빈도 수(Count)', color: colors.text }
          }
        }
      }
    };

    instances[canvasId] = new Chart(canvas, config);
    return instances[canvasId];
  }

  // 2. 공정관리도 (Shewhart 3-Sigma Control Chart)
  function renderControlChart(canvasId, ccData, varName = '측정치') {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const colors = getThemeColors();
    const labels = ccData.points.map(p => `No.${p.x}`);
    const values = ccData.points.map(p => p.y);

    // 포인트별 색상/크기 (이상치 강조)
    const pointColors = ccData.points.map(p => p.isAnomaly ? colors.outlier : colors.primary);
    const pointRadii = ccData.points.map(p => p.isAnomaly ? 6 : 2.5);
    const pointHoverRadii = ccData.points.map(p => p.isAnomaly ? 9 : 5);

    const config = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: `${varName} 실측값`,
            data: values,
            borderColor: colors.primary,
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            borderWidth: 1.5,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            pointRadius: pointRadii,
            pointHoverRadius: pointHoverRadii,
            tension: 0.1
          },
          {
            label: `UCL (상한: ${ccData.ucl.toFixed(2)})`,
            data: new Array(values.length).fill(ccData.ucl),
            borderColor: colors.ucl,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
          },
          {
            label: `CL (중심선/평균: ${ccData.cl.toFixed(2)})`,
            data: new Array(values.length).fill(ccData.cl),
            borderColor: colors.success,
            borderWidth: 2,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false
          },
          {
            label: `LCL (하한: ${ccData.lcl.toFixed(2)})`,
            data: new Array(values.length).fill(ccData.lcl),
            borderColor: colors.lcl,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: colors.text, font: { family: 'Pretendard, sans-serif' } }
          },
          tooltip: {
            backgroundColor: colors.bg,
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: colors.grid,
            borderWidth: 1,
            callbacks: {
              afterBody: function(context) {
                const idx = context[0].dataIndex;
                const pt = ccData.points[idx];
                if (pt && pt.isAnomaly) {
                  return `⚠️ [공정 이상치 감지]\n기준 3σ 한계를 벗어남`;
                }
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: colors.grid },
            ticks: { color: colors.text, maxTicksLimit: 20 }
          },
          y: {
            grid: { color: colors.grid },
            ticks: { color: colors.text },
            title: { display: true, text: '측정치(Value)', color: colors.text }
          }
        }
      }
    };

    instances[canvasId] = new Chart(canvas, config);
    return instances[canvasId];
  }

  // 3. 산점도 및 선형 회귀선 (Scatter + Regression Trendline)
  function renderScatterRegression(canvasId, regData, xName = 'X축', yName = 'Y축') {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const colors = getThemeColors();

    const scatterPoints = regData.scatterData.map(p => ({ x: p.x, y: p.y }));

    const config = {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: `${xName} vs ${yName} 데이터`,
            data: scatterPoints,
            backgroundColor: 'rgba(56, 189, 248, 0.6)',
            borderColor: colors.primary,
            borderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 7
          },
          {
            type: 'line',
            label: `선형 회귀선 (R²=${regData.r2.toFixed(3)})`,
            data: regData.trendline,
            borderColor: colors.accent,
            borderWidth: 2.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: colors.text }
          },
          tooltip: {
            backgroundColor: colors.bg,
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: colors.grid,
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                if (context.datasetIndex === 0) {
                  return `${xName}: ${context.raw.x.toFixed(2)}, ${yName}: ${context.raw.y.toFixed(2)}`;
                }
                return `회귀 추세선 (${xName}: ${context.raw.x.toFixed(2)}, 예측: ${context.raw.y.toFixed(2)})`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: colors.grid },
            ticks: { color: colors.text },
            title: { display: true, text: xName, color: colors.text }
          },
          y: {
            grid: { color: colors.grid },
            ticks: { color: colors.text },
            title: { display: true, text: yName, color: colors.text }
          }
        }
      }
    };

    instances[canvasId] = new Chart(canvas, config);
    return instances[canvasId];
  }

  // 4. 시계열 트렌드 및 이동평균 (Time-Series & Moving Average)
  function renderTimeSeries(canvasId, labels, seriesData, varName = '시계열') {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const colors = getThemeColors();

    const datasets = [
      {
        label: `${varName} 원본`,
        data: seriesData.raw,
        borderColor: 'rgba(56, 189, 248, 0.8)',
        backgroundColor: 'rgba(56, 189, 248, 0.05)',
        borderWidth: 1.5,
        pointRadius: seriesData.raw.length > 100 ? 0 : 2,
        fill: true,
        tension: 0.1
      }
    ];

    if (seriesData.sma && seriesData.sma.length > 0) {
      datasets.push({
        label: `단순이동평균 (SMA 5)`,
        data: seriesData.sma,
        borderColor: colors.warning,
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.2
      });
    }

    if (seriesData.ema && seriesData.ema.length > 0) {
      datasets.push({
        label: `지수이동평균 (EMA)`,
        data: seriesData.ema,
        borderColor: colors.accent,
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.2
      });
    }

    const config = {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            labels: { color: colors.text }
          },
          tooltip: {
            backgroundColor: colors.bg,
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: colors.grid,
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { color: colors.grid },
            ticks: { color: colors.text, maxTicksLimit: 15 }
          },
          y: {
            grid: { color: colors.grid },
            ticks: { color: colors.text },
            title: { display: true, text: varName, color: colors.text }
          }
        }
      }
    };

    instances[canvasId] = new Chart(canvas, config);
    return instances[canvasId];
  }

  // 5. 집단 간 평균 비교 막대 차트 (ANOVA / t-test용)
  function renderGroupComparison(canvasId, anovaData, metricName = '측정치') {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !anovaData) return;

    const colors = getThemeColors();
    const groupLabels = anovaData.groupStats.map(g => g.name);
    const means = anovaData.groupStats.map(g => g.mean);

    const palette = [
      'rgba(56, 189, 248, 0.7)',
      'rgba(129, 140, 248, 0.7)',
      'rgba(52, 211, 153, 0.7)',
      'rgba(251, 191, 36, 0.7)',
      'rgba(244, 63, 94, 0.7)'
    ];

    const borderPalette = [
      '#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f43f5e'
    ];

    const config = {
      type: 'bar',
      data: {
        labels: groupLabels,
        datasets: [
          {
            label: `그룹별 평균 (${metricName})`,
            data: means,
            backgroundColor: groupLabels.map((_, i) => palette[i % palette.length]),
            borderColor: groupLabels.map((_, i) => borderPalette[i % borderPalette.length]),
            borderWidth: 1.5,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: colors.text }
          },
          tooltip: {
            backgroundColor: colors.bg,
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: colors.grid,
            borderWidth: 1,
            callbacks: {
              afterBody: function(context) {
                const idx = context[0].dataIndex;
                const g = anovaData.groupStats[idx];
                return `샘플 수(N): ${g.n}\n표준편차: ${g.stdev.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: colors.grid },
            ticks: { color: colors.text },
            title: { display: true, text: '그룹', color: colors.text }
          },
          y: {
            grid: { color: colors.grid },
            ticks: { color: colors.text },
            title: { display: true, text: `평균 ${metricName}`, color: colors.text }
          }
        }
      }
    };

    instances[canvasId] = new Chart(canvas, config);
    return instances[canvasId];
  }

  // 6. 상관계수 히트맵 시각화 (순수 HTML/Canvas 렌더러)
  function renderCorrelationHeatmap(containerId, corrMatrixData) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { names, matrix } = corrMatrixData;
    const n = names.length;

    if (n === 0) {
      container.innerHTML = '<p class="text-muted">수치형 변수가 부족하여 상관계수를 계산할 수 없습니다.</p>';
      return;
    }

    let html = '<div class="heatmap-wrapper"><table class="heatmap-table"><thead><tr><th></th>';
    names.forEach(name => {
      html += `<th title="${name}">${name}</th>`;
    });
    html += '</tr></thead><tbody>';

    for (let i = 0; i < n; i++) {
      html += `<tr><th>${names[i]}</th>`;
      for (let j = 0; j < n; j++) {
        const val = matrix[i][j];
        const color = getHeatmapColor(val);
        const textColor = Math.abs(val) > 0.5 ? '#ffffff' : (currentThemeMode === 'dark' ? '#cbd5e1' : '#1e293b');
        html += `<td style="background-color: ${color}; color: ${textColor};" title="${names[i]} - ${names[j]}: ${val}">
          <span class="heatmap-val">${val.toFixed(2)}</span>
        </td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';

    container.innerHTML = html;
  }

  // 상관계수 값에 따른 히트맵 색상 생성 (-1: 파랑 ~ 0: 중립 ~ +1: 빨강)
  function getHeatmapColor(r) {
    // r: -1 to 1
    if (r > 0) {
      // 0 ~ 1: 중립(회색) -> 빨강(#f43f5e)
      const intensity = Math.min(1, Math.max(0, r));
      const rVal = Math.round(30 + intensity * 214);
      const gVal = Math.round(41 + (1 - intensity) * 30);
      const bVal = Math.round(59 + (1 - intensity) * 35);
      return `rgba(244, 63, 94, ${intensity * 0.85 + 0.1})`;
    } else {
      // -1 ~ 0: 파랑(#38bdf8) -> 중립
      const intensity = Math.min(1, Math.max(0, -r));
      return `rgba(56, 189, 248, ${intensity * 0.85 + 0.1})`;
    }
  }

  return {
    setTheme,
    getThemeColors,
    destroyChart,
    destroyAllCharts,
    renderHistogram,
    renderControlChart,
    renderScatterRegression,
    renderTimeSeries,
    renderGroupComparison,
    renderCorrelationHeatmap
  };
})();

if (typeof window !== 'undefined') {
  window.ChartManager = ChartManager;
}
