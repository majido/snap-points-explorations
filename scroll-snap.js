/**
 * Create a scroll snap object
 */
function ScrollSnap(scrollContainer, opts) {
  "use strict";

  // default values for options
  var options = {flingMode: 'ignore', interval: 500};
  extend(options, opts);

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

    if (options.flingMode == "ignore" || options.flingMode == "max") {
      snap();
    } else if (options.flingMode == "append") {
      waitForFlingEnd(function() {
        // fling is done so snap in the reverse direction
        var rdirection = -1 * velocityCalculator.getDirection();
        snap(rdirection);
      });
    }
  }

  /**
   * Detect that scroll fling is over and invoke callback
   */
  function waitForFlingEnd(callback) {
    var previousY = getPosition();
    var zeroDeltaCount = 0;

    // End of scroll fling is detected when the scrollTop has stablized
    var flingWaitLoopTimer = window.setInterval(function() {
      var currentY = getPosition();
      var delta = currentY - previousY;
      previousY = currentY;

      if (delta === 0) {
        zeroDeltaCount += 1;
      }

      if (zeroDeltaCount >= 2) {
        window.clearInterval(flingWaitLoopTimer);
        console.log('Observed %d zero scroll delta. Assume fling is over.',
                    zeroDeltaCount);
        callback();
      }
    }, 16);
  }


  /* Implement custom snap logic */
  function snap(direction) {

    // snap to closest value
    direction = direction || velocityCalculator.getDirection();
    var currentY = scrollContainer.scrollTop;
    var destinationY = calculateSnapPoint(currentY, direction);

    console.log("Direction: %d", direction);
    console.log('Snap destination %d is %d pixel further.', destinationY,
                destinationY - currentY);

    // var easing = window.BezierEasing.css['ease-out'];
    var easing = window.BezierEasing(0.215, 0.61, 0.355, 1);  // easeOutCubic
    if (options.flingMode == "append") {
      easing = window.BezierEasing.css["ease-in-out"];
    }

    animateSnap(destinationY, 1000, easing);
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
  * Setup necessary RAF loop for snap animation to reach snap destination
  * @destinationY the destination
  * @duration snap animation duration in ms.
  */
  function animateSnap(destinationY, duration, easing) {
    console.groupCollapsed('snap animation');
    console.log('animate to scrolltop: %d', destinationY);

    easing = easing || function(t) { return t; };  // default to linear easing

    var startTime = getTime(), endTime = startTime + duration;

    var startY = getPosition();  // current location
    var expected = startY;

    // RAF loop
    window.requestAnimationFrame(animateSnapLoop);

    function animateSnapLoop(hiResTime) {
      var now = getTime();
      // ensures the last frame is always executed
      now = Math.min(now, endTime);

      var currentY = scrollContainer.scrollTop;  // used only for debug purposes
      // time is the time between 0 to 1
      var animTime = (now - startTime) / duration;
      var step = (destinationY - startY) *
                 easing(animTime);  // apply easing by modifying animation
                                    // timing using animFrame
      var newY = Math.floor(startY + step);

      console.log('diff: %d, scrollTop: %d, newY: %d, frame: %0.2f',
                  (expected - currentY), currentY, newY, animTime);


      if (options.flingMode == "max") {
        // A simplistic way to avoid jank is to choose the closest value to
        // destination between animation and native scroll fling.
        // The curve becomes the union of two curves which may not be smooth at
        // all.
        var direction = velocityCalculator.getDirection();
        if (direction > 0)
          newY = Math.max(newY, currentY);
        else
          newY = Math.min(newY, currentY);
      }

      // FIXME: this is being overridden by scroller. Find a more
      // appropriate way to do this
      scrollContainer.scrollTop = expected = newY;

      if (now < endTime) {
        window.requestAnimationFrame(animateSnapLoop);
      } else {  // reached the end of the animation
        console.groupEnd('snap animations');
        console.log('Current scrollTop at %d', getPosition());
        return;
      }
    }
  }
  // Utility functions
  var getTime = Date.now || function() { return new Date().getTime(); };

  function getPosition() { return scrollContainer.scrollTop; }

  function printEvent(event) {
    console.log('event %s. scrollTop: %d.', event.type, getPosition());
  }
  // TODO: move to a utility module
  function extend(obj, source) {
    for (var prop in source) {
      obj[prop] = source[prop];
    }
  }

  this.setOptions = function(opts) { extend(options, opts); };

  return this;
}
