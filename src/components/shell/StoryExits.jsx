/**
 * <StoryExits> — the desktop's two ways out of the story; phones get the
 * inline <JumpMenu> instead. Same pill, same corner and same
 * show-inside-the-story rule as the floating <JumpMenu>.
 */
import { cx } from '../../lib/cx';
import styles from './StoryExits.module.css';

/**
 * @param {{ onTop: () => void, onSkip: () => void, visible?: boolean }} props
 */
export function StoryExits({ onTop, onSkip, visible = true }) {
  return (
    <div
      className={cx(styles.root, visible && styles.visible)}
      aria-hidden={visible ? undefined : true}
    >
      <button type="button" className={cx('pill', styles.exit)} onClick={onTop}>
        Back to top
      </button>
      <button type="button" className={cx('pill', styles.exit)} onClick={onSkip}>
        Skip the story
      </button>
    </div>
  );
}
