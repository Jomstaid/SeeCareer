import { cropRect, parsePhotoAnswer } from './photo';

describe('cropRect: the square cut out around a face', () => {
  it('centres on the face and leaves room around it', () => {
    // a face in the middle of a 1000x1000 picture, 200 wide
    const r = cropRect({ ymin: 400, xmin: 400, ymax: 600, xmax: 600 }, 1000, 1000);
    expect(r.size).toBe(288); // 200 * (1 + 2 * 0.22)
    expect(r.x).toBe(356);
    expect(r.y).toBe(356);
  });

  it('never goes outside the picture', () => {
    const topLeft = cropRect({ ymin: 0, xmin: 0, ymax: 300, xmax: 300 }, 800, 600);
    expect(topLeft.x).toBe(0);
    expect(topLeft.y).toBe(0);
    const bottomRight = cropRect({ ymin: 800, xmin: 800, ymax: 1000, xmax: 1000 }, 800, 600);
    expect(bottomRight.x + bottomRight.size).toBeLessThanOrEqual(800);
    expect(bottomRight.y + bottomRight.size).toBeLessThanOrEqual(600);
  });

  it('is never bigger than the shorter side of the picture', () => {
    const r = cropRect({ ymin: 0, xmin: 0, ymax: 1000, xmax: 1000 }, 900, 500);
    expect(r.size).toBe(500);
  });
});

describe('parsePhotoAnswer: reading where the AI says the photo is', () => {
  it('reads the picture number and the box', () => {
    const a = parsePhotoAnswer('Sure: {"photo": {"image": 2, "box": [100, 50, 400, 350]}}', 3);
    expect(a).toEqual({ image: 2, box: { ymin: 100, xmin: 50, ymax: 400, xmax: 350 } });
  });

  it('returns null when there is no photo or the answer is unusable', () => {
    expect(parsePhotoAnswer('{"photo": null}', 1)).toBeNull();
    expect(parsePhotoAnswer('no json here', 1)).toBeNull();
    expect(parsePhotoAnswer('{"photo": {"image": 5, "box": [1,2,300,400]}}', 2)).toBeNull(); // picture does not exist
    expect(parsePhotoAnswer('{"photo": {"image": 1, "box": [100,100,105,105]}}', 1)).toBeNull(); // far too small
    expect(parsePhotoAnswer('{"photo": {"image": 1, "box": [1,2,3]}}', 1)).toBeNull(); // not four numbers
  });

  it('keeps the numbers inside 0 to 1000', () => {
    const a = parsePhotoAnswer('{"photo": {"image": 1, "box": [-50, 20, 1200, 600]}}', 1);
    expect(a?.box).toEqual({ ymin: 0, xmin: 20, ymax: 1000, xmax: 600 });
  });
});
