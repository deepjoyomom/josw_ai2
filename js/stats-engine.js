/**
 * StatsEngine - 클라이언트 사이드 고정밀 통계 연산 라이브러리
 * 외부 API 통신 없이 100% 브라우저 메모리 내에서 실행됩니다.
 */
const StatsEngine = (() => {

  // --- 기본 수학 및 특수 함수 (p-value 산출용) ---

  // 에러 함수 erf(x) 근사 (Abramowitz and Stegun 7.1.26)
  function erf(x) {
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  // 표준정규분포 CDF (누적분포함수)
  function normalCDF(x, mean = 0, std = 1) {
    if (std <= 0) return 0;
    const z = (x - mean) / (std * Math.SQRT2);
    return 0.5 * (1.0 + erf(z));
  }

  // 표준정규분포 PDF (확률밀도함수)
  function normalPDF(x, mean = 0, std = 1) {
    if (std <= 0) return 0;
    const z = (x - mean) / std;
    return (1.0 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
  }

  // 감마 함수 로그 (Lanczos 근사)
  function logGamma(z) {
    const c = [
      57.1562356658629235, -59.5979603554754912,
      14.1360979704133005, -0.491913816097620199,
      0.339946499848118887e-4, 0.465236289270485756e-4,
      -0.983744753048795646e-4, 0.158088703224378389e-3,
      -0.210264441724104883e-3, 0.217439618115212643e-3,
      -0.164318106536763890e-3, 0.844182239838527433e-4,
      -0.261908384015814087e-4, 0.368991826595316234e-5
    ];
    let sum = 0.99999999999999709182;
    for (let i = 0; i < c.length; i++) {
      sum += c[i] / (z + i + 1);
    }
    const t = z + c.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum) - Math.log(z);
  }

  // 불완전 베타 함수 (Regularized Incomplete Beta Function, Ix(a,b))
  function incBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    
    // 대칭 변환
    if (x > (a + 1) / (a + b + 2)) {
      return 1 - incBeta(1 - x, b, a);
    }

    const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b)) * Math.pow(x, a) * Math.pow(1 - x, b) / a;
    
    // 연분수 (Continued Fraction) 전개
    let f = 1.0, c = 1.0, d = 0.0;
    const maxIter = 200;
    const eps = 1e-12;

    for (let m = 1; m <= maxIter; m++) {
      // 짝수 단계
      let numerator = -(a + m - 1) * (a + b + m - 1) * x / ((a + 2 * m - 2) * (a + 2 * m - 1));
      d = 1 + numerator * d;
      if (Math.abs(d) < eps) d = eps;
      c = 1 + numerator / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      f *= c * d;

      // 홀수 단계
      numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
      d = 1 + numerator * d;
      if (Math.abs(d) < eps) d = eps;
      c = 1 + numerator / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      const delta = c * d;
      f *= delta;

      if (Math.abs(delta - 1.0) < eps) break;
    }

    return front * f;
  }

  // Student's t-분포 p-value (양측 검정)
  function studentTDistributionPValue(t, df) {
    if (df <= 0) return NaN;
    t = Math.abs(t);
    const x = df / (df + t * t);
    const p = incBeta(x, df / 2, 0.5);
    return Math.min(1.0, Math.max(0.0, p));
  }

  // F-분포 p-value (단측 검정, 우측 꼬리 확률)
  function fDistributionPValue(f, df1, df2) {
    if (df1 <= 0 || df2 <= 0 || f < 0) return NaN;
    const x = df2 / (df2 + df1 * f);
    const p = incBeta(x, df2 / 2, df1 / 2);
    return Math.min(1.0, Math.max(0.0, p));
  }

  // --- 1. 기술 통계 (Descriptive Statistics) ---

  // 유효한 숫자 배열만 추출
  function filterNumbers(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map(v => (typeof v === 'number' ? v : parseFloat(v)))
      .filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));
  }

  function mean(data) {
    const valid = filterNumbers(data);
    if (valid.length === 0) return 0;
    return valid.reduce((acc, v) => acc + v, 0) / valid.length;
  }

  function median(data) {
    const valid = filterNumbers(data).sort((a, b) => a - b);
    const n = valid.length;
    if (n === 0) return 0;
    const mid = Math.floor(n / 2);
    return n % 2 !== 0 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  }

  function mode(data) {
    const valid = filterNumbers(data);
    if (valid.length === 0) return null;
    const freq = {};
    let maxFreq = 0;
    let modeVal = valid[0];

    valid.forEach(v => {
      freq[v] = (freq[v] || 0) + 1;
      if (freq[v] > maxFreq) {
        maxFreq = freq[v];
        modeVal = v;
      }
    });

    return maxFreq > 1 ? modeVal : valid[0];
  }

  function variance(data, isSample = true) {
    const valid = filterNumbers(data);
    const n = valid.length;
    if (n < (isSample ? 2 : 1)) return 0;
    const m = mean(valid);
    const ss = valid.reduce((acc, v) => acc + Math.pow(v - m, 2), 0);
    return ss / (isSample ? n - 1 : n);
  }

  function stdev(data, isSample = true) {
    return Math.sqrt(variance(data, isSample));
  }

  function quartiles(data) {
    const sorted = filterNumbers(data).sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return { q1: 0, q2: 0, q3: 0, min: 0, max: 0, iqr: 0 };

    const getPercentile = (arr, p) => {
      const pos = (arr.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      if (arr[base + 1] !== undefined) {
        return arr[base] + rest * (arr[base + 1] - arr[base]);
      } else {
        return arr[base];
      }
    };

    const q1 = getPercentile(sorted, 0.25);
    const q2 = getPercentile(sorted, 0.50);
    const q3 = getPercentile(sorted, 0.75);
    const min = sorted[0];
    const max = sorted[n - 1];
    const iqr = q3 - q1;

    return { q1, q2, q3, min, max, iqr };
  }

  // 왜도 (Skewness: 0이면 대칭, >0이면 오른쪽 꼬리, <0이면 왼쪽 꼬리)
  function skewness(data) {
    const valid = filterNumbers(data);
    const n = valid.length;
    if (n < 3) return 0;
    const m = mean(valid);
    const s = stdev(valid, true);
    if (s === 0) return 0;

    const m3 = valid.reduce((acc, v) => acc + Math.pow((v - m) / s, 3), 0);
    return (n / ((n - 1) * (n - 2))) * m3;
  }

  // 첨도 (Kurtosis: 정규분포 기준 초과 첨도 Excess Kurtosis, 정규분포는 0)
  function kurtosis(data) {
    const valid = filterNumbers(data);
    const n = valid.length;
    if (n < 4) return 0;
    const m = mean(valid);
    const s = stdev(valid, true);
    if (s === 0) return 0;

    const m4 = valid.reduce((acc, v) => acc + Math.pow((v - m) / s, 4), 0);
    const factor1 = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
    const factor2 = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    return factor1 * m4 - factor2;
  }

  // 전체 기술통계 요약 객체 생성
  function summarize(data) {
    const rawLen = Array.isArray(data) ? data.length : 0;
    const valid = filterNumbers(data);
    const n = valid.length;
    const missing = rawLen - n;

    if (n === 0) {
      return {
        count: 0, missing, mean: 0, median: 0, mode: null,
        variance: 0, stdev: 0, min: 0, max: 0, range: 0,
        q1: 0, q3: 0, iqr: 0, skewness: 0, kurtosis: 0,
        cv: 0 // 변동계수 (%)
      };
    }

    const m = mean(valid);
    const med = median(valid);
    const md = mode(valid);
    const v = variance(valid, true);
    const sd = stdev(valid, true);
    const q = quartiles(valid);
    const range = q.max - q.min;
    const skew = skewness(valid);
    const kurt = kurtosis(valid);
    const cv = m !== 0 ? (sd / Math.abs(m)) * 100 : 0;

    return {
      count: n,
      missing,
      mean: m,
      median: med,
      mode: md,
      variance: v,
      stdev: sd,
      min: q.min,
      max: q.max,
      range,
      q1: q.q1,
      q3: q.q3,
      iqr: q.iqr,
      skewness: skew,
      kurtosis: kurt,
      cv
    };
  }

  // --- 2. 히스토그램 & 정규분포 곡선 데이터 생성 ---

  function histogram(data, numBins = 15) {
    const valid = filterNumbers(data);
    if (valid.length === 0) return { bins: [], counts: [], normalCurve: [] };

    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min || 1;
    const binWidth = range / numBins;

    const binEdges = [];
    for (let i = 0; i <= numBins; i++) {
      binEdges.push(min + i * binWidth);
    }

    const counts = new Array(numBins).fill(0);
    valid.forEach(v => {
      let idx = Math.floor((v - min) / binWidth);
      if (idx >= numBins) idx = numBins - 1; // max 경계값
      counts[idx]++;
    });

    const labels = [];
    for (let i = 0; i < numBins; i++) {
      const start = binEdges[i].toFixed(2);
      const end = binEdges[i + 1].toFixed(2);
      labels.push(`${start} ~ ${end}`);
    }

    // 정규분포 이론 곡선 생성
    const m = mean(valid);
    const sd = stdev(valid);
    const normalCurve = [];
    for (let i = 0; i < numBins; i++) {
      const mid = (binEdges[i] + binEdges[i + 1]) / 2;
      const density = normalPDF(mid, m, sd);
      // 빈 높이 = 밀도 * 전체 개수 * binWidth
      const expectedCount = density * valid.length * binWidth;
      normalCurve.push(parseFloat(expectedCount.toFixed(2)));
    }

    return {
      labels,
      counts,
      normalCurve,
      binWidth,
      min,
      max
    };
  }

  // --- 3. 공정관리도(Shewhart Control Chart) 및 이상치 탐지 ---

  function controlChart(data, sigmaMultiplier = 3) {
    const valid = filterNumbers(data);
    const n = valid.length;
    if (n === 0) return { cl: 0, ucl: 0, lcl: 0, points: [], anomalies: [] };

    const cl = mean(valid);
    const sd = stdev(valid, true);
    const ucl = cl + sigmaMultiplier * sd;
    const lcl = cl - sigmaMultiplier * sd;

    const anomalies = [];
    const points = valid.map((val, idx) => {
      const isAbove = val > ucl;
      const isBelow = val < lcl;
      const isAnomaly = isAbove || isBelow;
      if (isAnomaly) {
        anomalies.push({
          index: idx + 1,
          value: val,
          type: isAbove ? 'UCL 초과(상한이탈)' : 'LCL 미달(하한이탈)',
          deviation: Math.abs(val - cl) / sd
        });
      }
      return {
        x: idx + 1,
        y: val,
        isAnomaly
      };
    });

    return {
      cl,
      ucl,
      lcl,
      sigma: sd,
      points,
      anomalies,
      anomalyCount: anomalies.length,
      anomalyRate: ((anomalies.length / n) * 100).toFixed(2)
    };
  }

  // IQR 및 Z-Score 이상치 통합 진단
  function detectOutliers(data) {
    const valid = filterNumbers(data);
    const q = quartiles(valid);
    const iqrLower = q.q1 - 1.5 * q.iqr;
    const iqrUpper = q.q3 + 1.5 * q.iqr;

    const m = mean(valid);
    const sd = stdev(valid);

    const outlierList = [];
    valid.forEach((val, idx) => {
      const zScore = sd > 0 ? (val - m) / sd : 0;
      const isIqrOutlier = val < iqrLower || val > iqrUpper;
      const isZScoreOutlier = Math.abs(zScore) >= 3;

      if (isIqrOutlier || isZScoreOutlier) {
        outlierList.push({
          index: idx + 1,
          value: val,
          zScore: parseFloat(zScore.toFixed(3)),
          isIqr: isIqrOutlier,
          isZScore: isZScoreOutlier
        });
      }
    });

    return {
      iqrLower,
      iqrUpper,
      iqrOutlierCount: outlierList.filter(o => o.isIqr).length,
      zScoreOutlierCount: outlierList.filter(o => o.isZScore).length,
      totalOutliers: outlierList
    };
  }

  // --- 4. 상관관계 분석 (Correlation Matrix & Scatter) ---

  function pearsonCorrelation(xArr, yArr) {
    if (xArr.length !== yArr.length || xArr.length < 2) return 0;
    
    // 유효한 쌍만 필터
    const pairs = [];
    for (let i = 0; i < xArr.length; i++) {
      const x = typeof xArr[i] === 'number' ? xArr[i] : parseFloat(xArr[i]);
      const y = typeof yArr[i] === 'number' ? yArr[i] : parseFloat(yArr[i]);
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
        pairs.push([x, y]);
      }
    }

    const n = pairs.length;
    if (n < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      const [x, y] = pairs[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    const numerator = n * sumXY - sumX * sumY;
    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denom === 0) return 0;
    return numerator / denom;
  }

  // 다변량 피어슨 상관계수 행렬
  function correlationMatrix(columnsData, columnNames) {
    const matrix = [];
    const pValues = [];

    for (let i = 0; i < columnNames.length; i++) {
      matrix[i] = [];
      pValues[i] = [];
      const colI = columnsData[columnNames[i]];

      for (let j = 0; j < columnNames.length; j++) {
        if (i === j) {
          matrix[i][j] = 1.0;
          pValues[i][j] = 0.0;
        } else if (j < i) {
          matrix[i][j] = matrix[j][i];
          pValues[i][j] = pValues[j][i];
        } else {
          const colJ = columnsData[columnNames[j]];
          const r = pearsonCorrelation(colI, colJ);
          matrix[i][j] = parseFloat(r.toFixed(4));

          // t = r * sqrt((n-2)/(1-r^2))
          const n = Math.min(colI.length, colJ.length);
          if (n > 2 && Math.abs(r) < 1) {
            const t = r * Math.sqrt((n - 2) / (1 - r * r));
            pValues[i][j] = studentTDistributionPValue(t, n - 2);
          } else {
            pValues[i][j] = r === 1 ? 0 : 1;
          }
        }
      }
    }

    return { names: columnNames, matrix, pValues };
  }

  // --- 5. 단순 선형 회귀 분석 (Simple Linear Regression) ---

  function linearRegression(xArr, yArr) {
    const pairs = [];
    for (let i = 0; i < xArr.length; i++) {
      const x = typeof xArr[i] === 'number' ? xArr[i] : parseFloat(xArr[i]);
      const y = typeof yArr[i] === 'number' ? yArr[i] : parseFloat(yArr[i]);
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
        pairs.push({ x, y });
      }
    }

    const n = pairs.length;
    if (n < 2) {
      return { slope: 0, intercept: 0, r2: 0, r: 0, stdErr: 0, pValue: 1, trendline: [] };
    }

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    pairs.forEach(p => {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
      sumY2 += p.y * p.y;
    });

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) {
      return { slope: 0, intercept: sumY / n, r2: 0, r: 0, stdErr: 0, pValue: 1, trendline: [] };
    }

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // R^2 및 잔차 계산
    const meanY = sumY / n;
    let ssTot = 0;
    let ssRes = 0;
    const residuals = [];

    pairs.forEach(p => {
      const predY = slope * p.x + intercept;
      const res = p.y - predY;
      residuals.push({ x: p.x, actual: p.y, pred: predY, residual: res });
      ssTot += Math.pow(p.y - meanY, 2);
      ssRes += Math.pow(res, 2);
    });

    const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
    const r = (slope >= 0 ? 1 : -1) * Math.sqrt(r2);

    // 표준 오차 및 p-value
    const df = n - 2;
    const sResidual = df > 0 ? Math.sqrt(ssRes / df) : 0;
    const sSlope = sResidual / Math.sqrt(sumX2 - (sumX * sumX) / n);
    const tStat = sSlope > 0 ? slope / sSlope : 0;
    const pVal = df > 0 ? studentTDistributionPValue(tStat, df) : 1;

    // 트렌드라인 점 (최소 x와 최대 x 기반)
    const minX = Math.min(...pairs.map(p => p.x));
    const maxX = Math.max(...pairs.map(p => p.x));
    const trendline = [
      { x: minX, y: slope * minX + intercept },
      { x: maxX, y: slope * maxX + intercept }
    ];

    return {
      n,
      slope,
      intercept,
      r2,
      r,
      stdErr: sResidual,
      tStat,
      pValue: pVal,
      trendline,
      residuals,
      scatterData: pairs
    };
  }

  // --- 6. 가설 검정 (Hypothesis Testing) ---

  // 독립표본 t-검정 (Two-Sample t-test / Welch's t-test 지원)
  function twoSampleTTest(sample1, sample2, equalVariance = false) {
    const s1 = filterNumbers(sample1);
    const s2 = filterNumbers(sample2);
    const n1 = s1.length;
    const n2 = s2.length;

    if (n1 < 2 || n2 < 2) {
      return {
        tStat: 0, df: 0, pValue: 1,
        mean1: 0, mean2: 0, diff: 0,
        isSignificant: false
      };
    }

    const m1 = mean(s1);
    const m2 = mean(s2);
    const v1 = variance(s1, true);
    const v2 = variance(s2, true);

    let tStat, df, seDiff;

    if (equalVariance) {
      // 합동 분산 (Pooled variance)
      const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
      seDiff = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
      df = n1 + n2 - 2;
      tStat = seDiff > 0 ? (m1 - m2) / seDiff : 0;
    } else {
      // 웰치의 t-검정 (Welch-Satterthwaite equation)
      const w1 = v1 / n1;
      const w2 = v2 / n2;
      seDiff = Math.sqrt(w1 + w2);
      tStat = seDiff > 0 ? (m1 - m2) / seDiff : 0;
      const num = Math.pow(w1 + w2, 2);
      const den = Math.pow(w1, 2) / (n1 - 1) + Math.pow(w2, 2) / (n2 - 1);
      df = den > 0 ? num / den : 1;
    }

    const pValue = studentTDistributionPValue(tStat, df);

    return {
      n1, n2,
      mean1: m1, mean2: m2,
      sd1: Math.sqrt(v1), sd2: Math.sqrt(v2),
      diff: m1 - m2,
      seDiff,
      tStat,
      df,
      pValue,
      isSignificant: pValue < 0.05
    };
  }

  // 일원배치 분산분석 (One-Way ANOVA)
  function oneWayAnova(groups) {
    // groups: { "GroupA": [1,2,3], "GroupB": [4,5,6], ... }
    const groupNames = Object.keys(groups);
    const k = groupNames.length;
    if (k < 2) return null;

    let totalN = 0;
    let grandSum = 0;
    const groupStats = [];

    groupNames.forEach(name => {
      const vals = filterNumbers(groups[name]);
      const n = vals.length;
      const m = mean(vals);
      const v = variance(vals, true);
      totalN += n;
      grandSum += m * n;
      groupStats.push({ name, n, mean: m, variance: v, stdev: Math.sqrt(v), raw: vals });
    });

    if (totalN <= k) return null;

    const grandMean = grandSum / totalN;

    // Between-group sum of squares (SSB)
    let ssb = 0;
    groupStats.forEach(g => {
      ssb += g.n * Math.pow(g.mean - grandMean, 2);
    });

    // Within-group sum of squares (SSW)
    let ssw = 0;
    groupStats.forEach(g => {
      g.raw.forEach(v => {
        ssw += Math.pow(v - g.mean, 2);
      });
    });

    const dfBetween = k - 1;
    const dfWithin = totalN - k;

    const msBetween = dfBetween > 0 ? ssb / dfBetween : 0;
    const msWithin = dfWithin > 0 ? ssw / dfWithin : 0;

    const fStat = msWithin > 0 ? msBetween / msWithin : 0;
    const pValue = fDistributionPValue(fStat, dfBetween, dfWithin);

    return {
      groupStats,
      grandMean,
      totalN,
      k,
      ssb,
      ssw,
      ssTotal: ssb + ssw,
      dfBetween,
      dfWithin,
      msBetween,
      msWithin,
      fStat,
      pValue,
      isSignificant: pValue < 0.05
    };
  }

  // --- 7. 시계열 트렌드 & 이동평균 (Moving Average) ---

  function simpleMovingAverage(data, windowSize = 5) {
    const valid = filterNumbers(data);
    const result = [];
    for (let i = 0; i < valid.length; i++) {
      if (i < windowSize - 1) {
        result.push(null);
      } else {
        const slice = valid.slice(i - windowSize + 1, i + 1);
        result.push(mean(slice));
      }
    }
    return result;
  }

  function exponentialMovingAverage(data, alpha = 0.3) {
    const valid = filterNumbers(data);
    if (valid.length === 0) return [];
    const result = [valid[0]];
    for (let i = 1; i < valid.length; i++) {
      const ema = alpha * valid[i] + (1 - alpha) * result[i - 1];
      result.push(ema);
    }
    return result;
  }

  return {
    mean,
    median,
    mode,
    variance,
    stdev,
    quartiles,
    skewness,
    kurtosis,
    summarize,
    histogram,
    controlChart,
    detectOutliers,
    pearsonCorrelation,
    correlationMatrix,
    linearRegression,
    twoSampleTTest,
    oneWayAnova,
    simpleMovingAverage,
    exponentialMovingAverage,
    normalCDF,
    normalPDF,
    studentTDistributionPValue,
    fDistributionPValue
  };
})();

// 글로벌 노출 (브라우저 환경)
if (typeof window !== 'undefined') {
  window.StatsEngine = StatsEngine;
}
