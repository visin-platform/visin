import UploadPanel from '../components/dataset/UploadPanel';

/**
 * The upload corner as shell-front renders it: on every page of the shell, not
 * only Vision's, because an upload keeps running while the user is on the home
 * page or in Labeling. Loaded from the same remote as `./App`, so it reads the
 * same upload store the dataset pages write to. Needs only the shell's Router.
 */
export default function RemoteUploads() {
  return <UploadPanel />;
}
