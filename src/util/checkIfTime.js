import moment from 'moment-timezone';
export default async function checkIfTime(startTime, endTime) {
    startTime = startTime || "11:15 AM"; // Start time
    endTime = endTime || "01:00 AM"; // End time on the next day

    const pakistanDate = moment().tz('Asia/Karachi'); // Get current Pakistan time
    const currentTime = pakistanDate; // Use the full moment object
    //   // Set the current time to 01:00 AM for testing purposes
    //   const currentTime = moment.tz('01:00 AM', 'hh:mm A', 'Asia/Karachi');

    // console.log("pakistanDate:", pakistanDate.format());
    console.log("currentTime:", currentTime);

    // Determine if the current time is before 2:00 AM
    const isBefore2AM = currentTime.hours() < 2;
    const referenceDay = isBefore2AM ? currentTime.clone().subtract(1, 'day') : currentTime;

    let startMoment = moment.tz(
        `${referenceDay.format('YYYY-MM-DD')} ${startTime}`,
        'YYYY-MM-DD hh:mm A',
        'Asia/Karachi'
    );

    let endMoment = moment.tz(
        `${referenceDay.format('YYYY-MM-DD')} ${endTime}`,
        'YYYY-MM-DD hh:mm A',
        'Asia/Karachi'
    );

    // If endMoment is logically before startMoment, adjust to the next day
    if (endMoment.isBefore(startMoment)) {
        endMoment.add(1, 'day');
    }

    // console.log("startMoment (adjusted):", startMoment.format());
    // console.log("endMoment (adjusted):", endMoment.format());

    // Check if the current time is within the range
    const isInRange = currentTime.isBetween(startMoment, endMoment, null, '[)');

    // console.log("isInRange:", isInRange);
    return isInRange;
}