<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>


# 로컬에서 실행하기

이 애플리케이션은 별도의 빌드 과정 없이 브라우저에서 바로 실행할 수 있습니다.

1. 이 저장소를 클론하거나 코드를 다운로드합니다.
2. `index.html` 파일을 웹 브라우저에서 엽니다.
3. 앱을 처음 실행하면 Gemini API 키를 입력하는 창이 나타납니다.
4. [Google AI Studio](https://aistudio.google.com/app/apikey)에서 발급받은 API 키를 입력하면 바로 앱 사용을 시작할 수 있습니다. 입력한 키는 브라우저의 로컬 스토리지에 저장됩니다.

---

## 배포하기

Firebase Hosting을 사용하여 간단하게 웹에 배포할 수 있습니다.

1. **Firebase CLI 설치:**
   ```bash
   npm install -g firebase-tools
   ```
2. **Firebase 로그인:**
   ```bash
   firebase login
   ```
3. **프로젝트 초기화 (최초 1회):**
   - 프로젝트 루트 디렉토리에서 다음 명령어를 실행합니다.
     ```bash
     firebase init hosting
     ```
   - `What do you want to use as your public directory?` 질문에는 `.` (현재 디렉토리)를 입력합니다.
   - `Configure as a single-page app (rewrite all urls to /index.html)?` 질문에는 `Yes`를 입력합니다.
   - `File ./index.html already exists. Overwrite?` 질문에는 `No`를 입력합니다.

4. **Firebase에 배포:**
   ```bash
   firebase deploy
   ```
   배포가 완료되면 제공되는 URL을 통해 웹에서 앱을 사용할 수 있습니다.
