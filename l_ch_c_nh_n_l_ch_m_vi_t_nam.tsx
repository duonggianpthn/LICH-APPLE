import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Calendar as CalendarIcon,
  List,
  Rows3,
  Square,
  Clock,
  AlignLeft,
  Trash2,
  Edit3,
  X,
  Check,
  Sparkles,
  CalendarDays
} from 'lucide-react';

// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

export type EventColor =
  | '#FF453A' // Apple Red
  | '#FF9F0A' // Apple Orange
  | '#FFD60A' // Apple Yellow
  | '#30D158' // Apple Green
  | '#0A84FF' // Apple Blue
  | '#BF5AF2'; // Apple Purple

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (Solar)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  notes: string;
  color: EventColor;
  createdAt: number;
  updatedAt: number;
}

export interface LunarDate {
  day: number;
  month: number;
  year: number;
  isLeap: boolean;
  jd: number;
}

export type CalendarViewMode = 'scroll' | 'paged';
export type ActiveTab = 'calendar' | 'events';

// ============================================================================
// 2. VIETNAMESE ASTRONOMICAL LUNAR CALENDAR ENGINE (UTC+7 / HỒ NGỌC ĐỨC)
// ============================================================================

const PI = Math.PI;

function INT(d: number): number {
  return Math.floor(d);
}

/**
 * Compute the (integral) Julian day number of day dd/mm/yyyy, i.e., the number
 * of days between 1/1/4713 BC (Julian calendar) and dd/mm/yyyy.
 */
function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd =
    dd +
    INT((153 * m + 2) / 5) +
    365 * y +
    INT(y / 4) -
    INT(y / 100) +
    INT(y / 400) -
    32045;
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  }
  return jd;
}

/**
 * Compute the time of the k-th new moon after the new moon of 1/1/1900 13:52 UCT
 * (measured as the number of days since 1/1/4713 BC noon UCT, e.g., 2451545.125 is 1/1/2000 15:00 UTC).
 * Returns a floating number, e.g., 2415079.9758617813 for k=2 or 2414975.9368746765 for k=-2
 */
function newMoon(k: number): number {
  const T = k / 1236.85; // Time in Julian centuries from 1900 January 0.5
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = PI / 180;
  let Jd1 =
    2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr); // Mean new moon
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3; // Sun's mean anomaly
  const Mpr =
    306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3; // Moon's mean anomaly
  const F =
    21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3; // Moon's argument of latitude
  let C1 =
    (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 =
    C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 =
    C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 =
    C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  let deltat: number;
  if (T < -11) {
    deltat =
      0.001 +
      0.000839 * T +
      0.0002261 * T2 -
      0.00000845 * T3 -
      0.000000081 * T * T3;
  } else {
    deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
  }
  return Jd1 + C1 - deltat;
}

/**
 * Compute the longitude of the sun at any time.
 * Parameter: floating number jdn, the number of days since 1/1/4713 BC noon
 * Algorithm from: "Astronomical Algorithms" by Jean Meeus, 1998
 */
function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525; // Time in Julian centuries from 2000-01-01 12:00:00 GMT
  const T2 = T * T;
  const dr = PI / 180; // degree to radian
  const M =
    357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2; // mean anomaly, degree
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2; // mean longitude, degree
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL =
    DL +
    (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) +
    0.00029 * Math.sin(dr * 3 * M);
  let L = L0 + DL; // true longitude, degree
  L = L * dr;
  L = L - PI * 2 * INT(L / (PI * 2)); // Normalize to (0, 2*PI)
  return L;
}

/**
 * Compute sun position at midnight of the day with the given Julian day number.
 * The time zone if the time difference between local time and UTC: 7.0 for UTC+7
 * The function returns a number between 0 and 11.
 */
function getSunLongitude(dayNumber: number, timeZone: number): number {
  return INT((sunLongitude(dayNumber - 0.5 - timeZone / 24) / PI) * 6);
}

/**
 * Compute the day of the k-th new moon in the given time zone.
 * The time zone if the time difference between local time and UTC: 7.0 for UTC+7
 */
function getNewMoonDay(k: number, timeZone: number): number {
  return INT(newMoon(k) + 0.5 + timeZone / 24);
}

/**
 * Find the day that starts the lunar month 11 of the given year for the given time zone
 */
function getLunarMonth11(yy: number, timeZone: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  const sunLong = getSunLongitude(nm, timeZone); // sun longitude at local midnight
  if (sunLong >= 9) {
    nm = getNewMoonDay(k - 1, timeZone);
  }
  return nm;
}

/**
 * Find the index of the leap month after the month starting on the day a11.
 */
function getLeapMonthOffset(a11: number, timeZone: number): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1; // We start with the month following lunar month 11
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
}

/**
 * Convert solar date dd/mm/yyyy to the corresponding Vietnamese lunar date (UTC+7)
 */
const lunarCache = new Map<string, LunarDate>();

function convertSolar2Lunar(
  dd: number,
  mm: number,
  yy: number,
  timeZone = 7.0
): LunarDate {
  const key = `${yy}-${mm}-${dd}`;
  const cached = lunarCache.get(key);
  if (cached) return cached;

  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) {
    monthStart = getNewMoonDay(k, timeZone);
  }
  let a11 = getLunarMonth11(yy, timeZone);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = getLunarMonth11(yy - 1, timeZone);
  } else {
    lunarYear = yy + 1;
    b11 = getLunarMonth11(yy + 1, timeZone);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let lunarLeap = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) {
        lunarLeap = true;
      }
    }
  }
  if (lunarMonth > 12) {
    lunarMonth = lunarMonth - 12;
  }
  if (lunarMonth >= 11 && diff < 4) {
    lunarYear -= 1;
  }

  const result: LunarDate = {
    day: lunarDay,
    month: lunarMonth,
    year: lunarYear,
    isLeap: lunarLeap,
    jd: dayNumber
  };
  lunarCache.set(key, result);
  return result;
}

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

function getCanChiYear(lunarYear: number): string {
  const can = CAN[(lunarYear + 6) % 10];
  const chi = CHI[(lunarYear + 8) % 12];
  return `${can} ${chi}`;
}

function getCanChiDay(jd: number): string {
  const can = CAN[(jd + 9) % 10];
  const chi = CHI[(jd + 1) % 12];
  return `${can} ${chi}`;
}

function formatLunarDayShort(lunar: LunarDate): string {
  if (lunar.day === 1) {
    return `${lunar.day}/${lunar.month}${lunar.isLeap ? 'N' : ''}`;
  }
  return `${lunar.day}`;
}

function formatLunarDayFull(lunar: LunarDate): string {
  const dayPrefix = lunar.day <= 10 ? `Mùng ${lunar.day}` : `Ngày ${lunar.day}`;
  const monthName =
    lunar.month === 1
      ? 'Tháng Giêng'
      : lunar.month === 12
      ? 'Tháng Chạp'
      : `Tháng ${lunar.month}`;
  const leapStr = lunar.isLeap ? ' (Nhuận)' : '';
  return `${dayPrefix} ${monthName}${leapStr}, năm ${getCanChiYear(lunar.year)}`;
}

// ============================================================================
// 3. DATE HELPERS (ASIA/HO_CHIMINH UTC+7)
// ============================================================================

const WEEKDAYS_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEKDAYS_FULL = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy'
];

/**
 * Get current date components strictly in Vietnam timezone (Asia/Ho_Chi_Minh, UTC+7)
 */
function getTodayVietnam(): { year: number; month: number; day: number; iso: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const year = parseInt(parts.find((p) => p.type === 'year')?.value || '2026', 10);
    const month = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10);
    const day = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);
    return {
      year,
      month,
      day,
      iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  } catch {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const vn = new Date(utc + 7 * 3600000);
    const year = vn.getFullYear();
    const month = vn.getMonth() + 1;
    const day = vn.getDate();
    return {
      year,
      month,
      day,
      iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }
}

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseISODate(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, month: m, day: d };
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Monday-first day of week index: 0 = Monday, ..., 5 = Saturday, 6 = Sunday
 */
function getMondayFirstDayOfWeek(year: number, month: number, day: number): number {
  const jsDay = new Date(year, month - 1, day).getDay(); // 0 = Sun, 1 = Mon ...
  return jsDay === 0 ? 6 : jsDay - 1;
}

function getVietnameseWeekdayName(year: number, month: number, day: number): string {
  const jsDay = new Date(year, month - 1, day).getDay();
  return WEEKDAYS_FULL[jsDay];
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const totalMonths = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (((totalMonths % 12) + 12) % 12) + 1;
  return { year: newYear, month: newMonth };
}

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// ============================================================================
// 4. EVENT STORAGE SERVICE (CLEAN REPOSITORY FOR FUTURE DB SYNC)
// ============================================================================

const STORAGE_KEY = 'ios_vn_calendar_events_v1';

const EVENT_COLORS: { value: EventColor; label: string }[] = [
  { value: '#FF453A', label: 'Đỏ' },
  { value: '#FF9F0A', label: 'Cam' },
  { value: '#FFD60A', label: 'Vàng' },
  { value: '#30D158', label: 'Xanh lá' },
  { value: '#0A84FF', label: 'Xanh dương' },
  { value: '#BF5AF2', label: 'Tím' }
];

class EventStorageService {
  static loadEvents(): CalendarEvent[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (error) {
      console.error('Failed to load events from LocalStorage:', error);
      return [];
    }
  }

  static saveEvents(events: CalendarEvent[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch (error) {
      console.error('Failed to save events to LocalStorage:', error);
    }
  }

  static generateId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}

// ============================================================================
// 5. SUB-COMPONENTS
// ============================================================================

interface MonthGridProps {
  year: number;
  month: number;
  todayISO: string;
  selectedDate: string;
  eventsByDate: Record<string, CalendarEvent[]>;
  onSelectDate: (isoDate: string) => void;
  showMonthBanner?: boolean;
  monthRef?: (el: HTMLDivElement | null) => void;
}

const MonthGrid: React.FC<MonthGridProps> = React.memo(
  ({
    year,
    month,
    todayISO,
    selectedDate,
    eventsByDate,
    onSelectDate,
    showMonthBanner = false,
    monthRef
  }) => {
    const weeks = useMemo(() => {
      const daysInMonth = getDaysInMonth(year, month);
      const startOffset = getMondayFirstDayOfWeek(year, month, 1);
      const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

      const rows: Array<
        Array<{
          day: number | null;
          iso: string | null;
          lunar: LunarDate | null;
          colIndex: number;
        }>
      > = [];

      let currentRow: Array<{
        day: number | null;
        iso: string | null;
        lunar: LunarDate | null;
        colIndex: number;
      }> = [];

      for (let i = 0; i < totalCells; i++) {
        const colIndex = i % 7;
        const dayNum = i - startOffset + 1;
        if (dayNum >= 1 && dayNum <= daysInMonth) {
          const iso = toISODate(year, month, dayNum);
          const lunar = convertSolar2Lunar(dayNum, month, year, 7.0);
          currentRow.push({ day: dayNum, iso, lunar, colIndex });
        } else {
          currentRow.push({ day: null, iso: null, lunar: null, colIndex });
        }

        if (colIndex === 6) {
          rows.push(currentRow);
          currentRow = [];
        }
      }
      return rows;
    }, [year, month]);

    return (
      <div
        ref={monthRef}
        data-month-key={getMonthKey(year, month)}
        data-year={year}
        data-month={month}
        className="w-full select-none"
      >
        {showMonthBanner && (
          <div className="px-4 pt-5 pb-2">
            <h2 className="text-[20px] font-bold tracking-tight text-white">
              Tháng {month}{' '}
              <span className="font-normal text-[#8E8E93]">{year}</span>
            </h2>
          </div>
        )}

        <div className="w-full">
          {weeks.map((week, wIdx) => (
            <div
              key={`${year}-${month}-w-${wIdx}`}
              className="grid grid-cols-7 border-t border-[#2C2C2E]/80"
            >
              {week.map((cell, cIdx) => {
                if (!cell.day || !cell.iso || !cell.lunar) {
                  return (
                    <div
                      key={`empty-${wIdx}-${cIdx}`}
                      className="h-[62px] sm:h-[66px]"
                    />
                  );
                }

                const isToday = cell.iso === todayISO;
                const isSelected = cell.iso === selectedDate;
                const isWeekend = cell.colIndex === 5 || cell.colIndex === 6; // T7 or CN
                const dayEvents = eventsByDate[cell.iso] || [];
                const isLunarFirst = cell.lunar.day === 1;
                const isLunarFull = cell.lunar.day === 15;

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => onSelectDate(cell.iso!)}
                    aria-label={`Ngày ${cell.day} tháng ${month} năm ${year}`}
                    className={`group relative flex h-[62px] sm:h-[66px] flex-col items-center justify-start pt-1.5 transition-colors duration-150 focus:outline-none active:bg-[#1C1C1E] ${
                      isSelected && !isToday ? 'bg-[#1C1C1E]/90' : ''
                    }`}
                  >
                    {/* Solar Date Number */}
                    <div
                      className={`flex h-[30px] w-[30px] items-center justify-center rounded-full text-[17px] leading-none transition-all duration-150 ${
                        isToday
                          ? 'bg-[#FF453A] font-bold text-white shadow-sm shadow-[#FF453A]/30'
                          : isSelected
                          ? 'bg-white text-black font-semibold'
                          : isWeekend
                          ? 'font-normal text-[#8E8E93]'
                          : 'font-medium text-white'
                      }`}
                    >
                      {cell.day}
                    </div>

                    {/* Vietnamese Lunar Date */}
                    <span
                      className={`mt-0.5 text-[10px] leading-tight tracking-tight ${
                        isToday
                          ? 'font-semibold text-[#FF453A]'
                          : isLunarFirst
                          ? 'font-semibold text-[#FF453A]'
                          : isLunarFull
                          ? 'font-medium text-white/90'
                          : 'font-normal text-[#8E8E93]'
                      }`}
                    >
                      {formatLunarDayShort(cell.lunar)}
                    </span>

                    {/* Event Dots (up to 3) */}
                    <div className="mt-1 flex h-[5px] items-center justify-center gap-[3px]">
                      {dayEvents.slice(0, 3).map((evt) => (
                        <span
                          key={evt.id}
                          className="h-[4.5px] w-[4.5px] rounded-full"
                          style={{ backgroundColor: evt.color }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }
);

// ============================================================================
// 6. EVENT FORM MODAL (ADD & EDIT)
// ============================================================================

interface EventFormModalProps {
  isOpen: boolean;
  initialDate: string;
  editingEvent: CalendarEvent | null;
  onClose: () => void;
  onSave: (data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>, existingId?: string) => void;
}

const EventFormModal: React.FC<EventFormModalProps> = ({
  isOpen,
  initialDate,
  editingEvent,
  onClose,
  onSave
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState<EventColor>('#FF453A');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      if (editingEvent) {
        setTitle(editingEvent.title);
        setDate(editingEvent.date);
        setStartTime(editingEvent.startTime);
        setEndTime(editingEvent.endTime);
        setNotes(editingEvent.notes);
        setColor(editingEvent.color);
      } else {
        setTitle('');
        setDate(initialDate);
        setStartTime('09:00');
        setEndTime('10:00');
        setNotes('');
        setColor('#FF453A');
      }
    }
  }, [isOpen, editingEvent, initialDate]);

  if (!isOpen) return null;

  const parsedSelected = date ? parseISODate(date) : null;
  const lunarPreview = parsedSelected
    ? convertSolar2Lunar(parsedSelected.day, parsedSelected.month, parsedSelected.year, 7.0)
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg('Vui lòng nhập tên sự kiện.');
      return;
    }
    if (!date) {
      setErrorMsg('Vui lòng chọn ngày diễn ra.');
      return;
    }
    if (startTime && endTime && endTime < startTime) {
      setErrorMsg('Giờ kết thúc phải sau hoặc bằng giờ bắt đầu.');
      return;
    }
    onSave(
      {
        title: trimmedTitle,
        date,
        startTime: startTime || '08:00',
        endTime: endTime || '09:00',
        notes: notes.trim(),
        color
      },
      editingEvent?.id
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-t-2xl sm:rounded-2xl bg-[#1C1C1E] border border-[#2C2C2E] text-white shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-[#2C2C2E] px-4 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="text-[16px] text-[#FF453A] hover:opacity-80 active:opacity-60 px-1 py-0.5"
          >
            Hủy
          </button>
          <h3 className="text-[16px] font-semibold text-white">
            {editingEvent ? 'Sửa sự kiện' : 'Sự kiện mới'}
          </h3>
          <button
            type="button"
            onClick={handleSubmit}
            className="text-[16px] font-semibold text-[#FF453A] hover:opacity-80 active:opacity-60 px-1 py-0.5"
          >
            {editingEvent ? 'Lưu' : 'Thêm'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[82vh] overflow-y-auto">
          {errorMsg && (
            <div className="rounded-xl bg-[#FF453A]/15 border border-[#FF453A]/40 px-3.5 py-2.5 text-[13px] text-[#FF453A]">
              {errorMsg}
            </div>
          )}

          {/* Title Input Card */}
          <div className="rounded-xl bg-[#2C2C2E]/70 px-3.5 py-2.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tên sự kiện"
              autoFocus
              className="w-full bg-transparent text-[16px] text-white placeholder-[#8E8E93] focus:outline-none"
            />
          </div>

          {/* Date & Time Card */}
          <div className="rounded-xl bg-[#2C2C2E]/70 divide-y divide-[#3A3A3C]">
            <div className="flex items-center justify-between px-3.5 py-3">
              <span className="text-[15px] text-white">Ngày diễn ra</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg bg-[#3A3A3C] px-2.5 py-1 text-[14px] text-white focus:outline-none [color-scheme:dark]"
              />
            </div>

            {lunarPreview && (
              <div className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
                <span className="text-[#8E8E93]">Ngày âm lịch</span>
                <span className="text-[#FF453A] font-medium">
                  {formatLunarDayFull(lunarPreview)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between px-3.5 py-3">
              <span className="text-[15px] text-white">Bắt đầu</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-lg bg-[#3A3A3C] px-2.5 py-1 text-[14px] text-white focus:outline-none [color-scheme:dark]"
              />
            </div>

            <div className="flex items-center justify-between px-3.5 py-3">
              <span className="text-[15px] text-white">Kết thúc</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-lg bg-[#3A3A3C] px-2.5 py-1 text-[14px] text-white focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Color Tag Selector */}
          <div className="rounded-xl bg-[#2C2C2E]/70 px-3.5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-white">Màu sắc</span>
              <div className="flex items-center gap-2.5">
                {EVENT_COLORS.map((c) => {
                  const active = color === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      aria-label={c.label}
                      className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform ${
                        active ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#1C1C1E]' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.value }}
                    >
                      {active && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Notes Card */}
          <div className="rounded-xl bg-[#2C2C2E]/70 px-3.5 py-2.5">
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú..."
              className="w-full resize-none bg-transparent text-[15px] text-white placeholder-[#8E8E93] focus:outline-none"
            />
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// 7. EVENT DETAIL MODAL
// ============================================================================

interface EventDetailModalProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
}

const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  onClose,
  onEdit,
  onDelete
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
  }, [event]);

  if (!event) return null;

  const { year, month, day } = parseISODate(event.date);
  const lunar = convertSolar2Lunar(day, month, year, 7.0);
  const weekday = getVietnameseWeekdayName(year, month, day);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-t-2xl sm:rounded-2xl bg-[#1C1C1E] border border-[#2C2C2E] text-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#2C2C2E] px-4 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-0.5 text-[16px] text-[#FF453A]"
          >
            <ChevronLeft className="h-5 w-5" />
            <span>Đóng</span>
          </button>
          <span className="text-[16px] font-semibold">Chi tiết sự kiện</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(event);
            }}
            className="text-[16px] font-medium text-[#FF453A]"
          >
            Sửa
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-start gap-3">
            <span
              className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: event.color }}
            />
            <div>
              <h3 className="text-[21px] font-bold leading-snug text-white">
                {event.title}
              </h3>
              <p className="mt-1 text-[14px] text-[#8E8E93]">
                {weekday}, {day} Tháng {month}, {year}
              </p>
              <p className="mt-0.5 text-[13px] text-[#FF453A]">
                {formatLunarDayFull(lunar)}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-[#2C2C2E]/70 divide-y divide-[#3A3A3C]">
            <div className="flex items-center gap-3 px-4 py-3">
              <Clock className="h-4 w-4 text-[#8E8E93]" />
              <span className="text-[15px] text-white">
                {event.startTime} – {event.endTime}
              </span>
            </div>
            {event.notes && (
              <div className="flex items-start gap-3 px-4 py-3">
                <AlignLeft className="mt-0.5 h-4 w-4 shrink-0 text-[#8E8E93]" />
                <p className="text-[15px] leading-relaxed text-white/90 whitespace-pre-wrap">
                  {event.notes}
                </p>
              </div>
            )}
          </div>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2C2C2E]/80 py-3 text-[15px] font-medium text-[#FF453A] transition-colors hover:bg-[#2C2C2E]"
            >
              <Trash2 className="h-4 w-4" />
              <span>Xóa sự kiện</span>
            </button>
          ) : (
            <div className="rounded-xl bg-[#FF453A]/15 border border-[#FF453A]/40 p-3.5 space-y-2.5">
              <p className="text-center text-[14px] text-white">
                Bạn chắc chắn muốn xóa sự kiện này?
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg bg-[#2C2C2E] py-2 text-[14px] font-medium text-white"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(event.id);
                    onClose();
                  }}
                  className="rounded-lg bg-[#FF453A] py-2 text-[14px] font-semibold text-white"
                >
                  Xóa ngay
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 8. QUICK YEAR & MONTH PICKER MODAL
// ============================================================================

interface YearMonthPickerModalProps {
  isOpen: boolean;
  currentYear: number;
  currentMonth: number;
  todayYear: number;
  todayMonth: number;
  onClose: () => void;
  onSelectYearMonth: (year: number, month: number) => void;
}

const YearMonthPickerModal: React.FC<YearMonthPickerModalProps> = ({
  isOpen,
  currentYear,
  currentMonth,
  todayYear,
  todayMonth,
  onClose,
  onSelectYearMonth
}) => {
  const [selectedYear, setSelectedYear] = useState(currentYear);

  useEffect(() => {
    if (isOpen) {
      setSelectedYear(currentYear);
    }
  }, [isOpen, currentYear]);

  if (!isOpen) return null;

  const months = Array.from({ length: 12 }, (_, idx) => idx + 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm pt-14 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl bg-[#1C1C1E] border border-[#2C2C2E] p-4 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#2C2C2E]">
          <button
            type="button"
            onClick={() => {
              setSelectedYear(todayYear);
              onSelectYearMonth(todayYear, todayMonth);
              onClose();
            }}
            className="text-[14px] font-medium text-[#FF453A]"
          >
            Năm nay ({todayYear})
          </button>
          <span className="text-[15px] font-semibold">Chọn Tháng & Năm</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[#2C2C2E] p-1 text-[#8E8E93] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Year Stepper */}
        <div className="my-4 flex items-center justify-between rounded-xl bg-[#2C2C2E]/70 px-3 py-2">
          <button
            type="button"
            onClick={() => setSelectedYear((y) => y - 1)}
            className="rounded-lg p-2 text-[#FF453A] hover:bg-[#3A3A3C]"
            aria-label="Năm trước"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <div className="text-[20px] font-bold text-white">{selectedYear}</div>
            <div className="text-[12px] text-[#8E8E93]">
              Năm {getCanChiYear(selectedYear)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedYear((y) => y + 1)}
            className="rounded-lg p-2 text-[#FF453A] hover:bg-[#3A3A3C]"
            aria-label="Năm sau"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* 12 Months Grid */}
        <div className="grid grid-cols-3 gap-2">
          {months.map((m) => {
            const isSelected = selectedYear === currentYear && m === currentMonth;
            const isTodayMonth = selectedYear === todayYear && m === todayMonth;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  onSelectYearMonth(selectedYear, m);
                  onClose();
                }}
                className={`rounded-xl py-2.5 text-[14px] font-medium transition-colors ${
                  isSelected
                    ? 'bg-[#FF453A] text-white font-semibold'
                    : isTodayMonth
                    ? 'bg-[#2C2C2E] text-[#FF453A] font-semibold'
                    : 'bg-[#2C2C2E]/50 text-white hover:bg-[#2C2C2E]'
                }`}
              >
                Tháng {m}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 9. REAL-TIME SEARCH MODAL (DATES, EVENT TITLES, NOTES)
// ============================================================================

interface SearchModalProps {
  isOpen: boolean;
  events: CalendarEvent[];
  onClose: () => void;
  onJumpToDate: (isoDate: string, highlightEvent?: CalendarEvent) => void;
}

const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  events,
  onClose,
  onJumpToDate
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const parsedDateMatch = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    // Match dd/mm/yyyy or dd-mm-yyyy or yyyy-mm-dd or dd/mm
    const dmy = q.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?$/);
    if (dmy) {
      const d = parseInt(dmy[1], 10);
      const m = parseInt(dmy[2], 10);
      const y = dmy[3] ? parseInt(dmy[3], 10) : getTodayVietnam().year;
      if (m >= 1 && m <= 12 && d >= 1 && d <= getDaysInMonth(y, m)) {
        return toISODate(y, m, d);
      }
    }
    const ymd = q.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (ymd) {
      const y = parseInt(ymd[1], 10);
      const m = parseInt(ymd[2], 10);
      const d = parseInt(ymd[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= getDaysInMonth(y, m)) {
        return toISODate(y, m, d);
      }
    }
    return null;
  }, [query]);

  const matchedEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...events].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 15);
    }
    return events
      .filter((evt) => {
        const { year, month, day } = parseISODate(evt.date);
        const dateFormatted = `${day}/${month}/${year} ${String(day).padStart(2, '0')}/${String(
          month
        ).padStart(2, '0')}/${year}`;
        return (
          evt.title.toLowerCase().includes(q) ||
          evt.notes.toLowerCase().includes(q) ||
          evt.date.includes(q) ||
          dateFormatted.includes(q)
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, query]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[480px] flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-2.5 border-b border-[#2C2C2E] px-4 py-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-[#1C1C1E] px-3 py-2">
            <Search className="h-4 w-4 text-[#8E8E93]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm sự kiện, ghi chú hoặc ngày (vd: 17/11/2026)..."
              autoFocus
              className="w-full bg-transparent text-[15px] text-white placeholder-[#8E8E93] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-[#8E8E93] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[16px] font-medium text-[#FF453A] px-1"
          >
            Hủy
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {parsedDateMatch && (
            <div>
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-[#8E8E93]">
                Đi đến ngày
              </div>
              <button
                type="button"
                onClick={() => {
                  onJumpToDate(parsedDateMatch);
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-xl bg-[#1C1C1E] p-3.5 text-left transition-colors hover:bg-[#2C2C2E]"
              >
                <div>
                  <div className="text-[15px] font-semibold text-white">
                    {(() => {
                      const { year, month, day } = parseISODate(parsedDateMatch);
                      return `${getVietnameseWeekdayName(year, month, day)}, ${day} Tháng ${month}, ${year}`;
                    })()}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[#FF453A]">
                    {(() => {
                      const { year, month, day } = parseISODate(parsedDateMatch);
                      return formatLunarDayFull(convertSolar2Lunar(day, month, year, 7.0));
                    })()}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#8E8E93]" />
              </button>
            </div>
          )}

          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#8E8E93]">
              {query.trim()
                ? `Kết quả sự kiện (${matchedEvents.length})`
                : 'Sự kiện đã lưu'}
            </div>

            {matchedEvents.length === 0 ? (
              <div className="rounded-xl bg-[#1C1C1E]/60 py-10 text-center text-[14px] text-[#8E8E93]">
                Không tìm thấy sự kiện phù hợp.
              </div>
            ) : (
              <div className="divide-y divide-[#2C2C2E] rounded-xl bg-[#1C1C1E] overflow-hidden">
                {matchedEvents.map((evt) => {
                  const { year, month, day } = parseISODate(evt.date);
                  return (
                    <button
                      key={evt.id}
                      type="button"
                      onClick={() => {
                        onJumpToDate(evt.date, evt);
                        onClose();
                      }}
                      className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-[#2C2C2E]/70"
                    >
                      <span
                        className="h-9 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: evt.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-white">
                          {evt.title}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[#8E8E93]">
                          {day}/{month}/{year} • {evt.startTime} – {evt.endTime}
                        </div>
                        {evt.notes && (
                          <div className="mt-0.5 truncate text-[12px] text-[#8E8E93]/80">
                            {evt.notes}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#8E8E93]" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 10. MAIN APPLICATION COMPONENT
// ============================================================================

export default function App() {
  const today = useMemo(() => getTodayVietnam(), []);

  // Navigation & View States
  const [activeTab, setActiveTab] = useState<ActiveTab>('calendar');
  const [viewMode, setViewMode] = useState<CalendarViewMode>('scroll');
  const [visibleYear, setVisibleYear] = useState<number>(today.year);
  const [visibleMonth, setVisibleMonth] = useState<number>(today.month);
  const [selectedDate, setSelectedDate] = useState<string>(today.iso);

  // Continuous Scroll Month Range (anchor + offset range)
  const [scrollAnchor, setScrollAnchor] = useState<{ year: number; month: number }>({
    year: today.year,
    month: today.month
  });
  const [monthOffsets, setMonthOffsets] = useState<{ min: number; max: number }>({
    min: -6,
    max: 12
  });

  // Events State (Persisted in LocalStorage)
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    EventStorageService.loadEvents()
  );

  // Modals State
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [inspectingEvent, setInspectingEvent] = useState<CalendarEvent | null>(null);

  // Refs for scroll tracking and touch swipe gestures
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const monthElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pendingScrollTargetRef = useRef<string | null>(today.iso.slice(0, 7));

  // Sync events to LocalStorage whenever modified
  useEffect(() => {
    EventStorageService.saveEvents(events);
  }, [events]);

  // Group events by ISO date for O(1) calendar cell lookup
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const evt of events) {
      if (!map[evt.date]) map[evt.date] = [];
      map[evt.date].push(evt);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [events]);

  // Generate list of months for continuous vertical scroll mode
  const scrollMonthsList = useMemo(() => {
    const list: { year: number; month: number; key: string }[] = [];
    for (let offset = monthOffsets.min; offset <= monthOffsets.max; offset++) {
      const { year, month } = addMonths(scrollAnchor.year, scrollAnchor.month, offset);
      list.push({ year, month, key: getMonthKey(year, month) });
    }
    return list;
  }, [scrollAnchor, monthOffsets]);

  // Scroll to target month when switching to scroll mode or jumping to a date
  useEffect(() => {
    if (viewMode !== 'scroll' || activeTab !== 'calendar') return;
    const targetKey = pendingScrollTargetRef.current;
    if (!targetKey) return;

    const raf = requestAnimationFrame(() => {
      const el = monthElementsRef.current.get(targetKey);
      const container = scrollContainerRef.current;
      if (el && container) {
        container.scrollTo({
          top: el.offsetTop - container.offsetTop,
          behavior: 'auto'
        });
        pendingScrollTargetRef.current = null;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [viewMode, activeTab, scrollMonthsList]);

  // Update active Month Header dynamically while vertically scrolling
  const handleVerticalScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || viewMode !== 'scroll') return;

    const containerTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const scrollHeight = container.scrollHeight;

    // Dynamically extend past or future months near edges
    if (containerTop < 250) {
      setMonthOffsets((prev) => ({ ...prev, min: prev.min - 6 }));
    } else if (scrollHeight - (containerTop + containerHeight) < 350) {
      setMonthOffsets((prev) => ({ ...prev, max: prev.max + 6 }));
    }

    // Determine which month occupies the upper-middle viewport
    const probeY = containerTop + 90;
    let foundYear = visibleYear;
    let foundMonth = visibleMonth;

    monthElementsRef.current.forEach((el) => {
      const top = el.offsetTop - container.offsetTop;
      const bottom = top + el.offsetHeight;
      if (probeY >= top && probeY < bottom) {
        const y = Number(el.dataset.year);
        const m = Number(el.dataset.month);
        if (y && m) {
          foundYear = y;
          foundMonth = m;
        }
      }
    });

    if (foundYear !== visibleYear) setVisibleYear(foundYear);
    if (foundMonth !== visibleMonth) setVisibleMonth(foundMonth);
  }, [viewMode, visibleYear, visibleMonth]);

  // Jump to any Year & Month cleanly
  const jumpToYearMonth = useCallback(
    (targetYear: number, targetMonth: number, targetDay?: number) => {
      setVisibleYear(targetYear);
      setVisibleMonth(targetMonth);

      const dayToSelect =
        targetDay ??
        Math.min(parseISODate(selectedDate).day, getDaysInMonth(targetYear, targetMonth));
      setSelectedDate(toISODate(targetYear, targetMonth, dayToSelect));

      if (viewMode === 'scroll') {
        const key = getMonthKey(targetYear, targetMonth);
        const existingEl = monthElementsRef.current.get(key);
        const container = scrollContainerRef.current;
        if (existingEl && container) {
          container.scrollTo({
            top: existingEl.offsetTop - container.offsetTop,
            behavior: 'smooth'
          });
        } else {
          setScrollAnchor({ year: targetYear, month: targetMonth });
          setMonthOffsets({ min: -6, max: 12 });
          pendingScrollTargetRef.current = key;
        }
      }
    },
    [selectedDate, viewMode]
  );

  // Jump back to Today (Vietnam timezone)
  const handleGoToday = useCallback(() => {
    const freshToday = getTodayVietnam();
    setActiveTab('calendar');
    setSelectedDate(freshToday.iso);
    setVisibleYear(freshToday.year);
    setVisibleMonth(freshToday.month);

    if (viewMode === 'scroll') {
      const key = getMonthKey(freshToday.year, freshToday.month);
      const existingEl = monthElementsRef.current.get(key);
      const container = scrollContainerRef.current;
      if (existingEl && container) {
        container.scrollTo({
          top: existingEl.offsetTop - container.offsetTop,
          behavior: 'smooth'
        });
      } else {
        setScrollAnchor({ year: freshToday.year, month: freshToday.month });
        setMonthOffsets({ min: -6, max: 12 });
        pendingScrollTargetRef.current = key;
      }
    }
  }, [viewMode]);

  // Step previous / next month in Paged Mode
  const stepMonth = useCallback(
    (delta: number) => {
      const next = addMonths(visibleYear, visibleMonth, delta);
      jumpToYearMonth(next.year, next.month);
    },
    [visibleYear, visibleMonth, jumpToYearMonth]
  );

  // Touch Swipe Left/Right Handlers for Paged Month Mode
  const handleTouchStart = (e: React.TouchEvent) => {
    if (viewMode !== 'paged') return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (viewMode !== 'paged' || !touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      if (dx < 0) {
        stepMonth(1); // Swipe left -> Next month
      } else {
        stepMonth(-1); // Swipe right -> Previous month
      }
    }
  };

  // CRUD Handlers for Events
  const handleSaveEvent = (
    data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => {
    const now = Date.now();
    if (existingId) {
      setEvents((prev) =>
        prev.map((item) =>
          item.id === existingId ? { ...item, ...data, updatedAt: now } : item
        )
      );
    } else {
      const newEvt: CalendarEvent = {
        ...data,
        id: EventStorageService.generateId(),
        createdAt: now,
        updatedAt: now
      };
      setEvents((prev) => [...prev, newEvt]);
    }
    const { year, month, day } = parseISODate(data.date);
    jumpToYearMonth(year, month, day);
  };

  const handleDeleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((item) => item.id !== id));
  };

  // Selected Date Info & Agenda Events
  const selectedParsed = useMemo(() => parseISODate(selectedDate), [selectedDate]);
  const selectedLunar = useMemo(
    () =>
      convertSolar2Lunar(
        selectedParsed.day,
        selectedParsed.month,
        selectedParsed.year,
        7.0
      ),
    [selectedParsed]
  );
  const selectedDayEvents = eventsByDate[selectedDate] || [];

  // Chronological All Events grouped by date for 'Sự kiện' tab
  const allEventsGrouped = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.startTime.localeCompare(b.startTime);
    });
    const groups: { date: string; items: CalendarEvent[] }[] = [];
    for (const evt of sorted) {
      const last = groups[groups.length - 1];
      if (last && last.date === evt.date) {
        last.items.push(evt);
      } else {
        groups.push({ date: evt.date, items: [evt] });
      }
    }
    return groups;
  }, [events]);

  return (
    <div className="min-h-screen w-full bg-[#000000] text-white flex justify-center selection:bg-[#FF453A] selection:text-white">
      {/* Main iOS Mobile-First Container (Centered on Desktop) */}
      <div className="relative flex h-screen w-full max-w-[480px] flex-col bg-[#000000] sm:border-x sm:border-[#2C2C2E]/70 overflow-hidden">
        {/* ================================================================
            A. TOP NAVIGATION BAR
           ================================================================ */}
        <header className="z-20 shrink-0 bg-[#000000]/95 backdrop-blur-md px-4 pt-3 pb-1">
          <div className="flex items-center justify-between">
            {/* Left: Year Jump Button */}
            <button
              type="button"
              onClick={() => setIsYearPickerOpen(true)}
              className="flex items-center gap-0.5 rounded-lg py-1 pr-2 text-[17px] font-medium text-[#FF453A] transition-opacity hover:opacity-80 active:opacity-60"
              title="Chọn nhanh tháng và năm"
            >
              <ChevronLeft className="h-5 w-5 stroke-[2.4]" />
              <span>{visibleYear}</span>
            </button>

            {/* Right: View Toggle, Search, Add Event */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const nextMode: CalendarViewMode =
                    viewMode === 'scroll' ? 'paged' : 'scroll';
                  if (nextMode === 'scroll') {
                    pendingScrollTargetRef.current = getMonthKey(
                      visibleYear,
                      visibleMonth
                    );
                  }
                  setViewMode(nextMode);
                  setActiveTab('calendar');
                }}
                aria-label="Chuyển đổi kiểu hiển thị lịch"
                title={
                  viewMode === 'scroll'
                    ? 'Chế độ: Cuộn dọc liên tục (Nhấn để chuyển vuốt từng tháng)'
                    : 'Chế độ: Vuốt từng tháng (Nhấn để chuyển cuộn dọc)'
                }
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#FF453A] transition-colors hover:bg-[#1C1C1E] active:bg-[#2C2C2E]"
              >
                {viewMode === 'scroll' ? (
                  <Rows3 className="h-[20px] w-[20px]" />
                ) : (
                  <Square className="h-[19px] w-[19px]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                aria-label="Tìm kiếm sự kiện và ngày tháng"
                title="Tìm kiếm"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#FF453A] transition-colors hover:bg-[#1C1C1E] active:bg-[#2C2C2E]"
              >
                <Search className="h-[20px] w-[20px]" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingEvent(null);
                  setIsEventFormOpen(true);
                }}
                aria-label="Thêm sự kiện mới"
                title="Thêm sự kiện mới"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#FF453A] transition-colors hover:bg-[#1C1C1E] active:bg-[#2C2C2E]"
              >
                <Plus className="h-[23px] w-[23px] stroke-[2.2]" />
              </button>
            </div>
          </div>

          {/* ==============================================================
              B. MONTH HEADER & WEEKDAY STRIP
             ============================================================== */}
          {activeTab === 'calendar' ? (
            <div className="mt-1">
              <div className="flex items-center justify-between pb-2.5">
                <h1 className="text-[28px] font-bold tracking-tight text-white">
                  Tháng {visibleMonth} – {visibleYear}
                </h1>

                {viewMode === 'paged' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => stepMonth(-1)}
                      aria-label="Tháng trước"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1C1C1E] text-[#FF453A] active:bg-[#2C2C2E]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => stepMonth(1)}
                      aria-label="Tháng sau"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1C1C1E] text-[#FF453A] active:bg-[#2C2C2E]"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* 7-Column Weekday Strip (T2 -> CN) */}
              <div className="grid grid-cols-7 pb-1.5 text-center text-[11px] font-semibold tracking-wide">
                {WEEKDAYS_SHORT.map((dayName, idx) => {
                  const isWeekend = idx === 5 || idx === 6;
                  return (
                    <div
                      key={dayName}
                      className={isWeekend ? 'text-[#8E8E93]' : 'text-white'}
                    >
                      {dayName}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-1 pb-2.5">
              <h1 className="text-[28px] font-bold tracking-tight text-white">
                Sự kiện
              </h1>
            </div>
          )}
        </header>

        {/* ================================================================
            C. MAIN CONTENT AREA (CALENDAR GRID OR EVENTS LIST)
           ================================================================ */}
        {activeTab === 'calendar' ? (
          <main className="flex flex-1 flex-col overflow-hidden">
            {/* Calendar Grid Container */}
            <div
              ref={scrollContainerRef}
              onScroll={handleVerticalScroll}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className={`flex-1 ${
                viewMode === 'scroll'
                  ? 'overflow-y-auto overscroll-contain scroll-smooth'
                  : 'overflow-y-auto'
              }`}
            >
              {viewMode === 'scroll' ? (
                <div className="pb-6">
                  {scrollMonthsList.map((mItem) => (
                    <MonthGrid
                      key={mItem.key}
                      year={mItem.year}
                      month={mItem.month}
                      todayISO={today.iso}
                      selectedDate={selectedDate}
                      eventsByDate={eventsByDate}
                      onSelectDate={(iso) => setSelectedDate(iso)}
                      showMonthBanner={
                        !(
                          mItem.year === visibleYear &&
                          mItem.month === visibleMonth
                        )
                      }
                      monthRef={(el) => {
                        if (el) {
                          monthElementsRef.current.set(mItem.key, el);
                        } else {
                          monthElementsRef.current.delete(mItem.key);
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="transition-all duration-200">
                  <MonthGrid
                    year={visibleYear}
                    month={visibleMonth}
                    todayISO={today.iso}
                    selectedDate={selectedDate}
                    eventsByDate={eventsByDate}
                    onSelectDate={(iso) => setSelectedDate(iso)}
                  />
                  <p className="mt-3 text-center text-[11px] text-[#8E8E93]">
                    Vuốt sang trái hoặc phải để chuyển tháng
                  </p>
                </div>
              )}
            </div>

            {/* Selected Date Agenda Drawer / Bottom Sheet */}
            <section className="shrink-0 border-t border-[#2C2C2E] bg-[#0B0B0D] px-4 pt-3 pb-3 max-h-[36vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-white">
                      {getVietnameseWeekdayName(
                        selectedParsed.year,
                        selectedParsed.month,
                        selectedParsed.day
                      )}
                      , {selectedParsed.day} Tháng {selectedParsed.month},{' '}
                      {selectedParsed.year}
                    </h2>
                    {selectedDate === today.iso && (
                      <span className="rounded-full bg-[#FF453A]/20 px-2 py-0.5 text-[10px] font-semibold text-[#FF453A]">
                        Hôm nay
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-[#8E8E93]">
                    {formatLunarDayFull(selectedLunar)} • Ngày{' '}
                    {getCanChiDay(selectedLunar.jd)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingEvent(null);
                    setIsEventFormOpen(true);
                  }}
                  className="shrink-0 rounded-full bg-[#1C1C1E] px-3 py-1.5 text-[12px] font-semibold text-[#FF453A] transition-colors hover:bg-[#2C2C2E]"
                >
                  + Thêm
                </button>
              </div>

              {/* Events List for Selected Date */}
              <div className="mt-2.5 space-y-2">
                {selectedDayEvents.length === 0 ? (
                  <div className="py-3 text-center text-[13px] text-[#8E8E93]">
                    Không có sự kiện trong ngày này
                  </div>
                ) : (
                  selectedDayEvents.map((evt) => (
                    <button
                      key={evt.id}
                      type="button"
                      onClick={() => setInspectingEvent(evt)}
                      className="flex w-full items-center gap-3 rounded-xl bg-[#1C1C1E] px-3 py-2.5 text-left transition-colors hover:bg-[#2C2C2E]/80 active:bg-[#2C2C2E]"
                    >
                      <span
                        className="h-8 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: evt.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-white">
                          {evt.title}
                        </div>
                        {evt.notes && (
                          <div className="truncate text-[12px] text-[#8E8E93]">
                            {evt.notes}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-[12px] text-[#8E8E93]">
                        <div className="text-white/90 font-medium">{evt.startTime}</div>
                        <div>{evt.endTime}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </main>
        ) : (
          /* ==============================================================
              ALL EVENTS LIST VIEW ('Sự kiện' TAB)
             ============================================================== */
          <main className="flex-1 overflow-y-auto px-4 pb-6">
            {allEventsGrouped.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center px-6">
                <CalendarDays className="h-12 w-12 text-[#8E8E93]/50 mb-3" />
                <p className="text-[16px] font-medium text-white">
                  Chưa có sự kiện nào
                </p>
                <p className="mt-1 text-[13px] text-[#8E8E93]">
                  Nhấn dấu + ở góc trên bên phải để tạo sự kiện đầu tiên của bạn.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingEvent(null);
                    setIsEventFormOpen(true);
                  }}
                  className="mt-4 rounded-full bg-[#FF453A] px-5 py-2 text-[14px] font-semibold text-white"
                >
                  + Thêm sự kiện mới
                </button>
              </div>
            ) : (
              <div className="space-y-5 pt-2">
                {allEventsGrouped.map((group) => {
                  const { year, month, day } = parseISODate(group.date);
                  const lunar = convertSolar2Lunar(day, month, year, 7.0);
                  const isTodayGroup = group.date === today.iso;

                  return (
                    <div key={group.date}>
                      <div className="mb-2 flex items-baseline justify-between border-b border-[#2C2C2E] pb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[14px] font-semibold ${
                              isTodayGroup ? 'text-[#FF453A]' : 'text-white'
                            }`}
                          >
                            {getVietnameseWeekdayName(year, month, day)}, {day} Tháng{' '}
                            {month}, {year}
                          </span>
                          {isTodayGroup && (
                            <span className="rounded bg-[#FF453A] px-1.5 py-0.5 text-[10px] font-bold text-white">
                              HÔM NAY
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[#8E8E93]">
                          {lunar.day}/{lunar.month} ÂL
                        </span>
                      </div>

                      <div className="space-y-2">
                        {group.items.map((evt) => (
                          <div
                            key={evt.id}
                            className="flex items-center justify-between gap-3 rounded-xl bg-[#1C1C1E] p-3"
                          >
                            <button
                              type="button"
                              onClick={() => setInspectingEvent(evt)}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <span
                                className="h-9 w-1 shrink-0 rounded-full"
                                style={{ backgroundColor: evt.color }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[15px] font-semibold text-white">
                                  {evt.title}
                                </div>
                                <div className="mt-0.5 text-[12px] text-[#8E8E93]">
                                  {evt.startTime} – {evt.endTime}
                                  {evt.notes ? ` • ${evt.notes}` : ''}
                                </div>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingEvent(evt);
                                setIsEventFormOpen(true);
                              }}
                              aria-label="Chỉnh sửa sự kiện"
                              className="rounded-lg p-2 text-[#8E8E93] hover:bg-[#2C2C2E] hover:text-white"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        )}

        {/* ================================================================
            D. BOTTOM NAVIGATION BAR
           ================================================================ */}
        <nav className="z-20 shrink-0 border-t border-[#2C2C2E] bg-[#000000]/85 backdrop-blur-md px-6 pt-2 pb-4 sm:pb-3">
          <div className="flex items-center justify-between">
            {/* Left: Hôm nay */}
            <button
              type="button"
              onClick={handleGoToday}
              className="flex flex-col items-center gap-0.5 py-1 text-[#FF453A] transition-opacity hover:opacity-80 active:opacity-60"
            >
              <Sparkles className="h-5 w-5" />
              <span className="text-[12px] font-semibold">Hôm nay</span>
            </button>

            {/* Center: Lịch */}
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`flex flex-col items-center gap-0.5 py-1 transition-colors ${
                activeTab === 'calendar' ? 'text-[#FF453A]' : 'text-[#8E8E93] hover:text-white'
              }`}
            >
              <CalendarIcon className="h-5 w-5" />
              <span className="text-[12px] font-semibold">Lịch</span>
            </button>

            {/* Right: Sự kiện */}
            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`relative flex flex-col items-center gap-0.5 py-1 transition-colors ${
                activeTab === 'events' ? 'text-[#FF453A]' : 'text-[#8E8E93] hover:text-white'
              }`}
            >
              <List className="h-5 w-5" />
              <span className="text-[12px] font-semibold">Sự kiện</span>
              {events.length > 0 && (
                <span className="absolute -right-2 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FF453A] px-1 text-[10px] font-bold text-white">
                  {events.length}
                </span>
              )}
            </button>
          </div>
        </nav>

        {/* ================================================================
            MODALS & SHEETS
           ================================================================ */}
        <YearMonthPickerModal
          isOpen={isYearPickerOpen}
          currentYear={visibleYear}
          currentMonth={visibleMonth}
          todayYear={today.year}
          todayMonth={today.month}
          onClose={() => setIsYearPickerOpen(false)}
          onSelectYearMonth={(y, m) => {
            setActiveTab('calendar');
            jumpToYearMonth(y, m);
          }}
        />

        <SearchModal
          isOpen={isSearchOpen}
          events={events}
          onClose={() => setIsSearchOpen(false)}
          onJumpToDate={(isoDate, evt) => {
            const { year, month, day } = parseISODate(isoDate);
            setActiveTab('calendar');
            jumpToYearMonth(year, month, day);
            if (evt) {
              setInspectingEvent(evt);
            }
          }}
        />

        <EventFormModal
          isOpen={isEventFormOpen}
          initialDate={selectedDate}
          editingEvent={editingEvent}
          onClose={() => {
            setIsEventFormOpen(false);
            setEditingEvent(null);
          }}
          onSave={handleSaveEvent}
        />

        <EventDetailModal
          event={inspectingEvent}
          onClose={() => setInspectingEvent(null)}
          onEdit={(evt) => {
            setEditingEvent(evt);
            setIsEventFormOpen(true);
          }}
          onDelete={handleDeleteEvent}
        />
      </div>
    </div>
  );
}