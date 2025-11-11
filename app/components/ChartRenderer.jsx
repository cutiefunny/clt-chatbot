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
      if (
        !parsedData ||
        !parsedData.type ||
        !parsedData.data ||
        !parsedData.options
      ) {
        throw new Error("Invalid chart data structure received.");
      }
      setChartData(parsedData);
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

    const { type, data, options } = chartData;

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
  }, [chartData]);

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