// All time in seconds.

function FlingCurve(initial_position, initial_velocity, initial_time) {
  var sign = 1;
  if (initial_velocity < 0) {
    console.log("sign is negative");
    sign = -1;
  }

  initial_velocity = Math.abs(initial_velocity);

  // From src/content/public/common/renderer_preferences.cc
  var p = [-5707.62, 172, 3.7];

  // From src/content/child/touch_fling_gesture_curve.cc.
  function position(local_time) {
    var t = local_time;
    return p[0] * Math.exp(-p[2] * t) - p[1] * t - p[0];
  }

  function velocity(local_time) {
    var t = local_time;
    return -p[0] * p[2] * Math.exp(-p[2] * t) - p[1];
  }

  function timeAtVelocity(velocity) {
    return (-Math.log((velocity + p[1]) / (-p[0] * p[2])) / p[2]);
  }

  initial_velocity = Math.min(initial_velocity, velocity(0));
  initial_velocity = Math.max(initial_velocity, 0);

  var local_start_time = timeAtVelocity(initial_velocity);
  var local_end_time = timeAtVelocity(0);
  var global_end_time = initial_time + local_end_time - local_start_time;
  var position_offset = initial_position - sign * position(local_start_time);
  var time_offset = local_start_time - initial_time;

  this.getPositionAtTime = function(time) {
    if (time > global_end_time) {
      time = global_end_time;
    }

    var result = position_offset + sign * position(time + time_offset);

    return result;
  };

  this.getFinalPosition = function() {

/*    console.log(
        "Fling curve = init velocity:%d, time_offset: %f, start: %d, end: %f, "
        "init_time:%d",
        initial_velocity, time_offset, local_start_time, local_end_time,
        initial_time);
*/
    return position_offset + sign * position(local_end_time);
  };

  this.getDuration = function() { return local_end_time - local_start_time; };

  this.doneFling = function(time) { return time > global_end_time; };
}
