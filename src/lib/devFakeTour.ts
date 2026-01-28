type DevSlot = {
  id: string;
  slot_date: string;
  slot_time: string;
  status: string;
  guide_id: string;
  guide_name?: string | null;
};

const partsToObject = (parts: Intl.DateTimeFormatPart[]) =>
  parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

const getUkDateInOneHour = () => {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(future);
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(future);
  const date = partsToObject(dateParts);
  const time = partsToObject(timeParts);
  return {
    slot_date: `${date.year}-${date.month}-${date.day}`,
    slot_time: `${time.hour}:${time.minute}:00`,
  };
};

export const isDevFakeTourEnabled = () => import.meta.env.VITE_DEV_FAKE_TOUR === "1";

export const DEV_FAKE_SLOT_ID = "dev-fake-slot";

export const isDevFakeSlotId = (slotId: string) => slotId === DEV_FAKE_SLOT_ID;

export const getDevFakeSlot = (guideId: string, guideName?: string | null): DevSlot => {
  const { slot_date, slot_time } = getUkDateInOneHour();
  return {
    id: DEV_FAKE_SLOT_ID,
    slot_date,
    slot_time,
    status: "planned",
    guide_id: guideId,
    guide_name: guideName ?? null,
  };
};
