// app/lib/excelUtils.js
"use client";

import * as XLSX from "xlsx";

/**
 * 엑셀 시리얼 날짜(숫자)를 YYYY-MM-DD 형식의 문자열로 변환합니다.
 * @param {number} serial - 엑셀의 날짜 시리얼 번호
 * @returns {string | null} 변환된 YYYY-MM-DD 문자열 또는 변환 실패 시 null
 */
function convertExcelDate(serial) {
  if (typeof serial !== "number" || serial <= 0) {
    return null;
  }
  try {
    // 엑셀은 1900-01-01을 1로 간주 (1904 날짜 체계 제외)
    // 25569는 1970-01-01 (Unix epoch)와 1900-01-01 간의 일수 차이 (엑셀의 1900년 윤년 버그 포함)
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400; // 86400초 = 하루
    const date_info = new Date(utc_value * 1000); // 밀리초 단위로 변환

    const year = date_info.getUTCFullYear();
    const month = String(date_info.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date_info.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  } catch (e) {
    console.error("Failed to convert excel date serial:", serial, e);
    return null;
  }
}

// XLSX 라이브러리 객체와 헬퍼 함수를 함께 내보냅니다.
export { XLSX, convertExcelDate };