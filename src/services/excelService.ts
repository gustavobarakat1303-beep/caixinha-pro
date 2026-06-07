import * as XLSX from 'xlsx';

export interface ExcelImportResult<T> {
  data: T[];
  errors: string[];
}

export function normalizeString(str: string): string {
  if (!str) return "";
  return String(str).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .trim();
}

function normalizeKey(key: string): string {
  return normalizeString(key).replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Robust date parsing for Excel values (handles Date objects, strings, and serial numbers)
 */
export function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  
  // If it's already a Date object (thanks to cellDates: true)
  if (value instanceof Date) return value;

  // If it's a number (Excel serial date)
  if (typeof value === 'number') {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }

  // If it's a string
  if (typeof value === 'string') {
    // Try DD/MM/YYYY
    const ddmmyyyy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (ddmmyyyy) {
      return new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
    }
    
    // Try YYYY-MM-DD
    const yyyymmdd = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (yyyymmdd) {
      return new Date(Number(yyyymmdd[1]), Number(yyyymmdd[2]) - 1, Number(yyyymmdd[3]));
    }

    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Finds a value in a row object by fuzzy matching the key
 */
export function getRowValue(row: any, searchTerms: string[]): any {
  const normalizedSearchTerms = searchTerms.map(t => normalizeKey(t));
  const keys = Object.keys(row);
  
  // Try exact normalized match first
  for (const term of normalizedSearchTerms) {
    for (const key of keys) {
      if (normalizeKey(key) === term) return row[key];
    }
  }

  // Try partial match (contains)
  for (const term of normalizedSearchTerms) {
    for (const key of keys) {
      if (normalizeKey(key).includes(term)) return row[key];
    }
  }

  return undefined;
}

export async function parseExcelFile<T>(file: File, mapper: (row: any) => T | null): Promise<ExcelImportResult<T>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Use defval to ensure all columns are present even if empty
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        console.log('Excel data parsed (first row):', json[0]);

        const results: T[] = [];
        const errors: string[] = [];

        json.forEach((row: any, index) => {
          try {
            // We pass the raw row to the mapper, but the mapper will use getRowValue
            const mapped = mapper(row);
            if (mapped) {
              results.push(mapped);
            }
          } catch (err) {
            errors.push(`Linha ${index + 2}: ${err instanceof Error ? err.message : String(err)}`);
          }
        });

        resolve({ data: results, errors });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

export function downloadTemplate(headers: string[], fileName: string) {
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
