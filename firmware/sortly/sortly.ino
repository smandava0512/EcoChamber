// Sortly protocol 1. Arduino Uno, positional servo signal on D5.
// Libraries: Servo and ArduinoJson 6.21.5. Baud: 115200.
// No servo pulses are sent at boot or on a hello command.
#include <Servo.h>
#include <ArduinoJson.h>

constexpr uint8_t SERVO_PIN = 5;
constexpr unsigned long STEP_MS = 15;
constexpr unsigned long SETTLE_MS = 400;
constexpr unsigned long FIRST_MOVE_MS = 3100;
Servo binServo;
char line[256];
size_t lineLength = 0;
bool overflow = false;
bool moving = false;
bool positionKnown = false;
int currentAngle = 90;
int targetAngle = 90;
char activeId[65] = "";
char activeCategory[8] = "";
unsigned long nextStep = 0;
unsigned long settledAt = 0;

void sendMessage(const char* id, const char* type, const char* code = nullptr) {
  StaticJsonDocument<256> response;
  response["id"] = id;
  response["type"] = type;
  if (code) response["code"] = code;
  if (!strcmp(type, "ready")) {
    response["protocol"] = 1;
    response["servoPin"] = SERVO_PIN;
    response["busy"] = moving;
  }
  if (!strcmp(type, "done")) {
    response["category"] = activeCategory;
    response["angle"] = targetAngle;
  }
  serializeJson(response, Serial);
  Serial.println();
}

void handleLine() {
  StaticJsonDocument<384> request;
  if (deserializeJson(request, line)) { sendMessage("", "error", "INVALID_JSON"); return; }
  const char* id = request["id"] | "";
  const char* type = request["type"] | "";
  if (!id[0] || strlen(id) > 64) { sendMessage("", "error", "INVALID_ID"); return; }
  if (!strcmp(type, "hello")) { sendMessage(id, "ready"); return; }
  if (strcmp(type, "move")) { sendMessage(id, "error", "INVALID_COMMAND"); return; }
  if (moving) { sendMessage(id, "error", "BUSY"); return; }
  const char* category = request["category"] | "";
  if (strcmp(category, "trash") && strcmp(category, "paper") && strcmp(category, "plastic")) {
    sendMessage(id, "error", "INVALID_CATEGORY"); return;
  }
  if (!request["angle"].is<int>()) { sendMessage(id, "error", "INVALID_ANGLE"); return; }
  const int angle = request["angle"];
  if (angle < 0 || angle > 180) { sendMessage(id, "error", "INVALID_ANGLE"); return; }
  strlcpy(activeId, id, sizeof(activeId));
  strlcpy(activeCategory, category, sizeof(activeCategory));
  targetAngle = angle;
  moving = true;
  settledAt = 0;
  sendMessage(activeId, "ack");
  if (!positionKnown) {
    // Preload the first target before attach; never emit the library's default 90-degree target.
    binServo.write(targetAngle);
    binServo.attach(SERVO_PIN);
    currentAngle = targetAngle;
    settledAt = millis() + FIRST_MOVE_MS;
    positionKnown = true;
  } else {
    nextStep = millis();
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println(F("{\"type\":\"boot\",\"protocol\":1,\"servoPin\":5}"));
}

void loop() {
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (overflow) sendMessage("", "error", "LINE_TOO_LONG");
      else if (lineLength) { line[lineLength] = '\0'; handleLine(); }
      lineLength = 0;
      overflow = false;
    } else if (!overflow) {
      if (lineLength < sizeof(line) - 1) line[lineLength++] = c;
      else overflow = true;
    }
  }
  if (!moving) return;
  const unsigned long now = millis();
  if (!settledAt && (long)(now - nextStep) >= 0) {
    if (currentAngle != targetAngle) {
      currentAngle += targetAngle > currentAngle ? 1 : -1;
      binServo.write(currentAngle);
    }
    nextStep = now + STEP_MS;
    if (currentAngle == targetAngle) settledAt = now + SETTLE_MS;
  }
  if (settledAt && (long)(now - settledAt) >= 0) {
    moving = false;
    sendMessage(activeId, "done");
  }
}
