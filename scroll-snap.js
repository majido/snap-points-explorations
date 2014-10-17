/**
 * Create a scroll snap object
 */
function ScrollSnap(scrollContainer, options) {
  "use strict";
  // TODO add default values for options
  this.options = options;
  this.scrollContainer = scrollContainer;

  var velocityCalculator = new VelocityCalculator(100);
  var isScrolling = false;

  // setup event handlers
  scrollContainer.addEventListener('scroll', scrollHandler);
  scrollContainer.addEventListener('touchbegin', touchstartHandler);
  scrollContainer.addEventListener('touchmove', touchmoveHandler);
  for (var event of['touchend', 'mouseup']) {
    scrollContainer.addEventListener(event, touchendHandler);
  }


  function printEvent(event) {
    console.log('event %s. scrollTop: %d.', event.type,
                scrollContainer.scrollTop);
  }

  function scrollHandler(event) {
    isScrolling = true;
    printEvent(event);

    velocityCalculator.addValue(getPosition(), getTime());
  }

  function touchstartHandler(event) {
    // reset event buffer for direction/velocity calculation
    printEvent(event);

    velocityCalculator.reset();
    velocityCalculator.addValue(getPosition(), getTime());
  }

  function touchmoveHandler(event) {
    printEvent(event);

    velocityCalculator.addValue(getPosition(), getTime());
  }


  function touchendHandler(event) {
    // handle first touchend after scrolling is complete
    if (!isScrolling) return;
    isScrolling = false;

    printEvent(event);

    if (options.flingTreatement == "ignore" ||
        options.flingTreatement == "max") {
      snap();
    } else if (options.flingTreatement == "post-fling") {
      waitForFlingEnd();
    }
  }

  function waitForFlingEnd() {
    var previousY = getPosition();
    var zeroDeltaCount = 0;

    // End of scroll fling is detected when there are not any change
    window.requestAnimationFrame(flingWaitLoop);

    console.groupCollapsed('fling wait');
    function flingWaitLoop(hiResTime) {
      var currentY = getPosition();
      var delta = currentY - previousY;
      console.log('delta: %d, scrolltop: %d', delta, currentY);
      previousY = currentY;
      if (delta == 0) zeroDeltaCount += 1;

      if (zeroDeltaCount < 5)
        window.requestAnimationFrame(flingWaitLoop);
      else
        console.groupEnd('fling wait');
    }
  }


  /* Implement custom snap logic */
  function snap(direction) {
    // determine final destination ignoring the fling.

    // snap to closest value
    var currentY = scrollContainer.scrollTop;
    var direction = direction || velocityCalculator.getDirection();
    var destinationY = calculateSnapPoint(currentY, direction);

    console.log("Direction: %d", direction);
    console.log('Snap destination %d is %d pixel further.', destinationY,
                destinationY - currentY);

    // snap by setting scrollTop
    // var easing = window.BezierEasing.css['ease-out'];
    var easing = window.BezierEasing(0.215, 0.61, 0.355, 1);  // easeOutCubic
    setupSnapAnimation(destinationY, 1000, easing);
  }

  function calculateSnapPoint(landingY, direction) {
    var interval = options.interval;
    var max = scrollContainer.scrollHeight;

    var closest;
    if (direction >= 0) {
      closest = Math.ceil(landingY / interval) * interval;
      closest = Math.min(closest, max);
    } else {
      closest = Math.floor(landingY / interval) * interval;
    }

    return closest;
  }

  /**
  * duration in ms.
  */
  function setupSnapAnimation(destinationY, duration, easing) {
    console.groupCollapsed('snap animation');
    console.log('animate to scrolltop: %d', destinationY);

    easing = easing || function(t) { return t; };  // default to linear easing

    var startTime = getTime(), endTime = startTime + duration;

    var startY = scrollContainer.scrollTop;  // current location
    var expected = scrollContainer.scrollTop;

    // RAF loop

    window.requestAnimationFrame(animateSnap);

    function animateSnap(hiResTime) {
      var now = getTime();
      // ensures the last frame is always executed
      now = Math.min(now, endTime);

      var currentY = scrollContainer.scrollTop;  // used only for debug purposes
      // linear movement
      var animTime =
          (now - startTime) / duration;  // time is the time between 0 to 1
      var step = (destinationY - startY) *
                 easing(animTime);  // apply easing by modifying animation
                                    // timing using animFrame
      var newY = Math.floor(startY + step);

      console.log('diff: %d, scrollTop: %d, newY: %d, frame: %0.2f',
                  (expected - currentY), currentY, newY, animTime);


      if (options.flingTreatement == "ignore") {
        // do nothing
      } else if (options.flingTreatement == "max") {
        // a simplistic way to avoid jank by choosing the closest value to
        // destination between animation and native fling.
        // The curve becomes the union of two curves which may not be smooth at
        // all.
        var direction = velocityCalculator.getDirection();
        if (direction > 0)
          newY = Math.max(newY, currentY);
        else
          newY = Math.min(newY, currentY);
      } else {
        console.warn("flingTreatement %s is not supported.",
                     options.flingTreatement);
      }

      // FIXME: this is being overridden by scroller. Find a more
      // appropriate way to do this
      scrollContainer.scrollTop = expected = newY;

      if (now < endTime) {
        window.requestAnimationFrame(animateSnap);
      } else {  // reached the end of the animation
        console.groupEnd('snap animations');
        console.log('Current scrollTop at %d', scrollContainer.scrollTop);
        return;
      }
    }
  }
  // Utility functions
  function getPosition() { return scrollContainer.scrollTop; };
  var getTime = Date.now || function() { return new Date().getTime(); };


  return this;
}
