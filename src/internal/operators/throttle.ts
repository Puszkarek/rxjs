import { Subscription } from '../Subscription';

import { MonoTypeOperatorFunction, ObservableInput } from '../types';
import { operate } from '../util/lift';
import { createOperatorSubscriber } from './OperatorSubscriber';
import { from } from '../observable/from';

export interface ThrottleConfig {
  leading?: boolean;
  trailing?: boolean;
}

export const defaultThrottleConfig: ThrottleConfig = {
  leading: true,
  trailing: false,
};

/**
 * Emits a value from the source Observable, then ignores subsequent source
 * values for a duration determined by another Observable, then repeats this
 * process.
 *
 * <span class="informal">It's like {@link throttleTime}, but the silencing
 * duration is determined by a second Observable.</span>
 *
 * ![](throttle.svg)
 *
 * `throttle` emits the source Observable values on the output Observable
 * when its internal timer is disabled, and ignores source values when the timer
 * is enabled. Initially, the timer is disabled. As soon as the first source
 * value arrives, it is forwarded to the output Observable, and then the timer
 * is enabled by calling the `durationSelector` function with the source value,
 * which returns the "duration" Observable. When the duration Observable emits a
 * value, the timer is disabled, and this process repeats for the
 * next source value.
 *
 * ## Example
 *
 * Emit clicks at a rate of at most one click per second
 *
 * ```ts
 * import { fromEvent, throttle, interval } from 'rxjs';
 *
 * const clicks = fromEvent(document, 'click');
 * const result = clicks.pipe(throttle(() => interval(1000)));
 *
 * result.subscribe(x => console.log(x));
 * ```
 *
 * @see {@link audit}
 * @see {@link debounce}
 * @see {@link delayWhen}
 * @see {@link sample}
 * @see {@link throttleTime}
 *
 * @param durationSelector A function
 * that receives a value from the source Observable, for computing the silencing
 * duration for each source value, returned as an Observable or a Promise.
 * @param config a configuration object to define `leading` and `trailing` behavior. Defaults
 * to `{ leading: true, trailing: false }`.
 * @return A function that returns an Observable that performs the throttle
 * operation to limit the rate of emissions from the source.
 */
export function throttle<T>(
  durationSelector: (value: T) => ObservableInput<any>,
  config: ThrottleConfig = defaultThrottleConfig
): MonoTypeOperatorFunction<T> {
  return operate((source, subscriber) => {
    const { leading, trailing } = config;
    let hasValue = false;
    let sendValue: T | null = null;
    let throttled: Subscription | null = null;
    let isComplete = false;

    const endThrottling = () => {
      throttled?.unsubscribe();
      throttled = null;
      if (trailing) {
        send();
        isComplete && subscriber.complete();
      }
    };

    const cleanupThrottling = () => {
      throttled = null;
      isComplete && subscriber.complete();
    };

    const startThrottle = (value: T) =>
      (throttled = from(durationSelector(value)).subscribe(createOperatorSubscriber(subscriber, endThrottling, cleanupThrottling)));

    const send = () => {
      if (hasValue) {
        // Ensure we clear out our value and hasValue flag
        // before we emit, otherwise reentrant code can cause
        // issues here.
        hasValue = false;
        const value = sendValue!;
        sendValue = null;
        // Emit the value.
        subscriber.next(value);
        !isComplete && startThrottle(value);
      }
    };

    source.subscribe(
      createOperatorSubscriber(
        subscriber,
        // Regarding the presence of throttled.closed in the following
        // conditions, if a synchronous duration selector is specified - weird,
        // but legal - an already-closed subscription will be assigned to
        // throttled, so the subscription's closed property needs to be checked,
        // too.
        (value) => {
          hasValue = true;
          sendValue = value;
          !(throttled && !throttled.closed) && (leading ? send() : startThrottle(value));
        },
        () => {
          isComplete = true;
          !(trailing && hasValue && throttled && !throttled.closed) && subscriber.complete();
        }
      )
    );
  });
}
