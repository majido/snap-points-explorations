// Time in in ms, velocity out in pixels per second.
function VelocityCalculator(bufferSize, type) {
  "use strict";

  type = type || 'linear';

  var data = [];

  this.reset = function() { data = []; };

  // We do this frequently, so keep it light. Delay as much computation as
  // possible until |getVelocity| is called.
  this.addValue = function(y, ms) {
    data.push([ms, y]);
    while (data.length > bufferSize ||
           (data.length > 1 && ms - data[0][0] > 200)) {
      data.shift();
    }
  };

  this.getDirection = function() {
    if (data.length < 2) {
      console.warn("No enough data to decide the scroll direction!");
      return 1;
    }

    // TODO use velocity to determine direction
    var newestPos = data[data.length - 1][1];
    var oldestPos = data[0][1];

    return (newestPos - oldestPos < 0) ? -1 : 1;
  };

  this.getVelocity = function(ms) {
    if (data.length < 2) {
      return 0;
    }

    var usable_data = [];
    var newestTime = data[data.length - 1][0];
    var newestPosition = data[data.length - 1][1];
    for (var i = 0; i < data.length; ++i) {
      usable_data.push([newestTime - data[i][0], newestPosition - data[i][1]]);
      //      console.log("Position\t", newestPosition - data[i][1]);
      //      console.log("Time\t", newestTime - data[i][0]);
    }

    var velocity;

    if (type == 'polynomial') {
      // Return velocity at last point.
      var regression_result = window.regression('polynomial', usable_data);

      var lastPointTime = usable_data[usable_data.length - 1][0];
      velocity = (2 * lastPointTime * regression_result.equation[2] +
                  regression_result.equation[1]) *
                 1000;

      // console.log("sample size:"+ usable_data.length, " result:"+
      // regression_result.string);

    } else if (type == 'linear') {  // Use linear
      var regression_result = window.regression('linear', usable_data);
      velocity = regression_result.equation[0] * 1000;
    }


    if (isNaN(velocity)) {
      return;
    }

    return velocity;
  };

  this.getLastVelocity = function() {
        if (data.length < 2) {
          return;
        }

        var p1 = data[data.length - 1];
        var p2 = data[data.length - 2];

        return (p1[1] - p2[1]) * 1000 / (p1[0] - p2[0]);
      }

      this.getTime = function() {
    if (data.length)
      return data[data.length - 1][0];
    else
      return 0;
  };
}
