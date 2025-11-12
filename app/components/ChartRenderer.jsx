// app/components/ChartRenderer.jsx
"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";
import styles from "./ChartRenderer.module.css";

// Chart.js에 필요한 모듈(Scale, Element, Plugin)을 등록합니다.
// Bar, Line, Pie 차트에 필요한 요소들을 모두 등록합니다.
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement, // Bar 차트
  LineElement, // Line 차트
  PointElement, // Line 차트의 점
  ArcElement, // Pie, Doughnut 차트
  Title,
  Tooltip,
  Legend
);

// --- 👇 [추가] mockChartData에서 가져온 기본 옵션 ---
const defaultChartOptions = {
  responsive: true,
  plugins: {
    legend: {
      position: "top",
    },
    title: {
      display: true,
      text: "Chart", // 기본 제목 (API에서 제공 가능)
    },
  },
  scales: {
    y: {
      beginAtZero: true,
    },
  },
};

// --- 👇 [추가] Bar 차트 전용 기본 옵션 (가로 막대) ---
const defaultBarOptions = {
  ...defaultChartOptions,
  indexAxis: 'y', // 막대가 가로인지 세로인지 지정
  plugins: {
    ...defaultChartOptions.plugins,
    title: {
      display: true,
      text: "Bar Chart", // 기본 제목
    },
  },
};
// --- 👆 [추가] ---


/**
 * LLM 스트림에서 받은 차트 JSON 문자열을 파싱하여 렌더링하는 컴포넌트입니다.
 * @param {string} chartJsonString - streamProcessors.js에서 전달받은 차트 데이터 JSON 문자열
 */
export default function ChartRenderer({ chartJsonString }) {
  const [chartData, setChartData] = useState(null);
  const [error, setError] = useState(null);

  // chartJsonString prop이 변경될 때마다 JSON을 파싱합니다.
  useEffect(() => {
    if (!chartJsonString) {
      setChartData(null);
      setError(null);
      return;
    }

    try {
      const parsedData = JSON.parse(chartJsonString);
      // --- 👇 [수정] 유효성 검사 변경 (options는 선택 사항) ---
      if (
        !parsedData ||
        !parsedData.type ||
        !parsedData.data
        // !parsedData.options // options는 더 이상 필수가 아님
      ) {
        throw new Error("Invalid chart data structure received (missing type or data).");
      }
      // --- 👆 [수정] ---

      // --- 👇 [추가] 옵션 병합 로직 ---
      let finalOptions;
      if (parsedData.options) {
        // API에서 옵션을 제공한 경우 (API 옵션을 우선 사용)
        finalOptions = parsedData.options;
      } else {
        // API에서 옵션을 제공하지 않은 경우, 타입에 따라 기본값 할당
        switch (parsedData.type) {
          case "bar":
            finalOptions = defaultBarOptions;
            break;
          case "line":
          case "pie":
          default:
            finalOptions = defaultChartOptions;
            break;
        }
      }
      
      // API에서 제공한 제목(title)이 있으면 기본 제목 덮어쓰기
      if (parsedData.title && finalOptions.plugins?.title) {
        finalOptions.plugins.title.text = parsedData.title;
      }
      
      // 최종 차트 데이터(data + options)를 state에 저장
      setChartData({
        type: parsedData.type,
        data: parsedData.data,
        options: finalOptions, // 병합/선택된 옵션 사용
      });
      // --- 👆 [추가] ---
      
      setError(null);
    } catch (e) {
      console.error("[ChartRenderer] Error parsing chart JSON:", e.message, chartJsonString);
      setError(`Failed to load chart: ${e.message}`);
      setChartData(null);
    }
  }, [chartJsonString]);

  // chartData.type에 따라 적절한 차트 컴포넌트(Bar, Line, Pie)를 동적으로 선택합니다.
  const ChartComponent = useMemo(() => {
    if (!chartData) return null;

    const { type, data, options } = chartData; // state에 저장된 최종 데이터를 사용

    switch (type) {
      case "bar":
        return <Bar data={data} options={options} />;
      case "line":
        return <Line data={data} options={options} />;
      case "pie":
        return <Pie data={data} options={options} />;
      default:
        // 지원하지 않는 차트 타입일 경우 에러 메시지를 표시합니다.
        setError(`Unsupported chart type: ${type}`);
        return null;
    }
  }, [chartData]); // chartData가 변경될 때만 재생성

  // 1. 파싱 에러가 발생한 경우
  if (error) {
    return (
      <div className={styles.errorContainer}>
        <strong>Chart Error:</strong>
        <p>{error}</p>
      </div>
    );
  }

  // 2. 데이터가 아직 준비되지 않은 경우 (로딩 중)
  if (!chartData || !ChartComponent) {
    return (
      <div className={styles.chartContainer}>
        <p>Loading chart...</p>
      </div>
    );
  }

  // 3. 성공적으로 차트를 렌더링하는 경우
  return (
    <div className={styles.chartContainer}>
      {ChartComponent}
    </div>
  );
}