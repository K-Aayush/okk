import calendarLink from 'calendar-link';

const { google } = calendarLink;

export const createCalendarLinks = ({
  title,
  description,
  start,
  end,
  duration,
  guests,
}) => {
  const googleLink = google({
    title,
    description,
    start,
    end,
    duration,
    guests,
  });

  return { googleLink };
};
