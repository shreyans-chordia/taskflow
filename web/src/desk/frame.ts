/**
 * The desk renders on demand, so the first frame after the room sat still reports the whole idle gap (often
 * seconds) as its delta. Count such a frame as one ordinary 60 fps step: animations then start from where they
 * are instead of jumping half-way (hover lift) or skipping to the end (lamp fade). Real slow frames keep their delta.
 */
export const frameStep = (dt: number) => (dt > 0.1 ? 1 / 60 : dt);
